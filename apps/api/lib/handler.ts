import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  claimIdempotencyKey,
  connectDb,
  hitRateLimit,
  holdIdempotencyKey,
  releaseIdempotencyKey,
  storeIdempotentResponse,
  type RateLimitRule,
} from "@namitiszunk/core/api";
import type { RequestActor } from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import * as Sentry from "@sentry/nextjs";
import type { z } from "zod";

import { errorResponse } from "./error-response";

// The T-030 actor; its `id` scopes rate limits and idempotency keys.
type Actor = RequestActor;

type Input<S> = S extends z.ZodType ? z.infer<S> : undefined;

type Params = Record<string, string | string[] | undefined>;

type Context<A, I> = {
  /** A clone, so the handler may still read the body itself. */
  request: Request;
  actor: A;
  input: I;
  /** The raw body ("" for GET, HEAD and DELETE). */
  bodyText: string;
  params: Params;
  requestId: string;
};

/**
 * What an idempotent endpoint keeps for a replay. The stored body must hold no secret:
 * order creation (T-033) stores only the order id and re-issues guestToken and clientSecret
 * in `fromReplay`.
 */
type Replay<A, I> = {
  /** Non-secret data to store, from the JSON body `fn` answered with. */
  toReplay: (body: unknown) => unknown;
  /** Rebuilds the response body from the stored data on a repeat request. */
  fromReplay: (stored: unknown, ctx: Context<A, I>) => Promise<unknown>;
};

type Options<A extends Actor | null, S extends z.ZodType | undefined> = {
  /** Required, so no route is public by accident: "public", or the caller (null gives 401). */
  auth: "public" | ((request: Request) => Promise<A | null>);
  /** Required: "none", or throws (`requirePermission` from @namitiszunk/core/auth throws Forbidden) for 403. */
  permission:
    | "none"
    | ((ctx: {
        actor: A;
        input: Input<S>;
        params: Params;
      }) => void | Promise<void>);
  /** Validates the JSON body, or the query string for GET, HEAD and DELETE. */
  input?: S;
  /** Counted per client IP, per signed-in caller and per `rateLimitKey`, each in its own bucket. */
  rateLimit?: RateLimitRule;
  /** A target to limit after validation (a phone number for OTP, a venue for PIN guesses). */
  rateLimitKey?: (input: Input<S>) => string;
  /** POST only: a request with an Idempotency-Key header gets the replay on repeat. */
  idempotent?: Replay<A, Input<S>>;
};

type RouteContext = { params: Promise<Params> };

const QUERY_METHODS = new Set(["GET", "HEAD", "DELETE"]);

// An anonymous caller's scope for idempotency: a client-generated random token (128+ bits, base64url).
const SESSION_ID = /^[A-Za-z0-9_-]{22,128}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// Vercel overwrites x-forwarded-for with the real client address, so it cannot be spoofed there.
function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** The route as written in app/ (`/v1/orders/[id]`), so all ids share one bucket. */
function routeTemplate(pathname: string, params: Params): string {
  const names = Object.entries(params);
  return pathname
    .split("/")
    .map((segment) => {
      const value = decodeURIComponent(segment);
      const match = names.find(([, v]) =>
        Array.isArray(v) ? v.includes(value) : v === value,
      );
      return match ? `[${match[0]}]` : segment;
    })
    .join("/");
}

function issueFields(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.map(String).join("."), issue.code]),
  );
}

/**
 * Every /v1 route goes through this (CI check: lib/v1-routes.test.ts).
 * Order: rate limit → authentication → Zod validation → permission → business logic.
 * `fn` returns data (sent as `{ data }` with 200) or its own Response.
 */
export function handler<
  A extends Actor | null = null,
  S extends z.ZodType | undefined = undefined,
>(options: Options<A, S>, fn: (ctx: Context<A, Input<S>>) => Promise<unknown>) {
  return async (request: Request, route: RouteContext): Promise<Response> => {
    const requestId = randomUUID();
    const fail = (
      status: number,
      code: string,
      extra?: Parameters<typeof errorResponse>[3],
    ) => errorResponse(status, code, requestId, extra);
    let claimedKey: string | undefined;
    // Once `fn` returned, its side effect happened: the key must never be released.
    let returned = false;

    try {
      const url = new URL(request.url);
      const fnRequest = request.clone();
      const params = await route.params;
      const idempotencyHeader =
        options.idempotent && request.method === "POST"
          ? request.headers.get("idempotency-key")
          : null;
      if (
        idempotencyHeader !== null &&
        !IDEMPOTENCY_KEY.test(idempotencyHeader)
      ) {
        return fail(400, "validation_failed", {
          fields: { "Idempotency-Key": "invalid" },
        });
      }

      if (options.rateLimit || idempotencyHeader !== null) {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI is not set");
        await connectDb(uri);
      }

      const bucket = `${request.method} ${routeTemplate(url.pathname, params)}`;
      const limit = async (scope: string) => {
        if (!options.rateLimit) return null;
        const limited = await hitRateLimit(
          `${bucket}|${scope}`,
          options.rateLimit,
        );
        return limited
          ? fail(429, "rate_limited", {
              headers: { "Retry-After": String(limited.retryAfterSeconds) },
            })
          : null;
      };

      if (options.rateLimit) {
        const ip = clientIp(request);
        // Vercel always sets the address; without one in production nobody could be told apart.
        if (ip === null && process.env.NODE_ENV === "production") {
          return fail(400, "client_unknown");
        }
        const limited = await limit(`ip:${ip ?? "local"}`);
        if (limited) return limited;
      }

      // A public endpoint has no caller: A is null.
      const actor = (
        options.auth === "public" ? null : await options.auth(request)
      ) as A;
      if (options.auth !== "public" && actor === null) {
        return fail(401, "unauthorized");
      }
      if (actor) {
        const limited = await limit(`actor:${actor.id}`);
        if (limited) return limited;
      }

      const bodyText = QUERY_METHODS.has(request.method)
        ? ""
        : await request.text();
      let input = undefined as Input<S>;
      if (options.input) {
        let raw: unknown;
        if (QUERY_METHODS.has(request.method)) {
          raw = Object.fromEntries(url.searchParams);
        } else {
          try {
            raw = bodyText ? JSON.parse(bodyText) : {};
          } catch {
            return fail(400, "invalid_json");
          }
        }
        const parsed = options.input.safeParse(raw);
        if (!parsed.success) {
          return fail(400, "validation_failed", {
            fields: issueFields(parsed.error),
          });
        }
        input = parsed.data as Input<S>;
      }
      if (options.rateLimitKey) {
        const limited = await limit(
          `key:${sha256(options.rateLimitKey(input))}`,
        );
        if (limited) return limited;
      }

      if (options.permission !== "none") {
        await options.permission({ actor, input, params });
      }

      const ctx: Context<A, Input<S>> = {
        request: fnRequest,
        actor,
        input,
        bodyText,
        params,
        requestId,
      };

      if (options.idempotent && idempotencyHeader !== null) {
        // Scoped per endpoint and caller, so nobody can replay another caller's response.
        const sessionId = request.headers.get("x-session-id");
        const scope = actor
          ? `actor:${actor.id}`
          : sessionId && SESSION_ID.test(sessionId)
            ? `session:${sessionId}`
            : null;
        if (scope === null) {
          return fail(400, "validation_failed", {
            fields: { "X-Session-Id": "required" },
          });
        }
        const key = sha256(`${url.pathname}|${scope}|${idempotencyHeader}`);
        const claim = await claimIdempotencyKey(key, sha256(bodyText));
        if (claim.kind === "replay") {
          const body = await options.idempotent.fromReplay(
            JSON.parse(claim.response.body),
            ctx,
          );
          return Response.json(body, {
            status: claim.response.status,
            headers: {
              "idempotent-replayed": "true",
              "x-request-id": requestId,
            },
          });
        }
        if (claim.kind === "in_progress") {
          return fail(409, "idempotency_in_progress");
        }
        if (claim.kind === "mismatch") {
          return fail(409, "idempotency_key_reused");
        }
        claimedKey = key;
      }

      const result = await fn(ctx);
      returned = true;
      const response =
        result instanceof Response ? result : Response.json({ data: result });

      if (options.idempotent && claimedKey) {
        try {
          await storeIdempotentResponse(claimedKey, {
            status: response.status,
            contentType: "application/json",
            body: JSON.stringify(
              options.idempotent.toReplay(await response.clone().json()),
            ),
          });
        } catch (storeError) {
          // The side effect happened: answer it, and keep the key so a repeat gets 409, never a second run.
          Sentry.captureException(storeError, { tags: { requestId } });
          await holdIdempotencyKey(claimedKey).catch((holdError: unknown) =>
            Sentry.captureException(holdError, { tags: { requestId } }),
          );
        }
      }
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      if (claimedKey && !returned) {
        await releaseIdempotencyKey(claimedKey).catch((releaseError: unknown) =>
          Sentry.captureException(releaseError, { tags: { requestId } }),
        );
      }
      if (error instanceof AppError) {
        return fail(error.status, error.code, { fields: error.fields });
      }
      Sentry.captureException(error, { tags: { requestId } });
      return fail(500, "internal");
    }
  };
}
