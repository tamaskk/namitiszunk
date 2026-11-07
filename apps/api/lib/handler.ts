import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  claimIdempotencyKey,
  connectDb,
  hitRateLimit,
  releaseIdempotencyKey,
  storeIdempotentResponse,
  type RateLimitRule,
} from "@namitiszunk/core/api";
import { AppError } from "@namitiszunk/core/errors";
import * as Sentry from "@sentry/nextjs";
import type { z } from "zod";

import { errorResponse } from "./error-response";

// shortcut: the smallest actor the wrapper needs (an id to scope idempotency keys); use T-030's type once merged.
type Actor = { id: string };

type Input<S> = S extends z.ZodType ? z.infer<S> : undefined;

type Options<A extends Actor | null, S extends z.ZodType | undefined> = {
  /** Returns the caller, or null for 401. Leave it out for a public endpoint. */
  auth?: (request: Request) => Promise<A | null>;
  /** Throws (`requirePermission` from @namitiszunk/core/auth throws Forbidden) for 403. */
  permission?: (ctx: { actor: A; input: Input<S> }) => void | Promise<void>;
  /** Validates the JSON body, or the query string for GET, HEAD and DELETE. */
  input?: S;
  rateLimit?: RateLimitRule;
  /** POST only: a request with an Idempotency-Key header gets the stored response on repeat. */
  idempotent?: boolean;
};

type Context<A, I> = {
  request: Request;
  actor: A;
  input: I;
  params: Record<string, string | string[] | undefined>;
  requestId: string;
};

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const QUERY_METHODS = new Set(["GET", "HEAD", "DELETE"]);

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// Vercel overwrites x-forwarded-for with the real client address, so it cannot be spoofed there.
function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
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

    try {
      const url = new URL(request.url);
      const idempotencyHeader =
        options.idempotent && request.method === "POST"
          ? request.headers.get("idempotency-key")
          : null;

      if (options.rateLimit || idempotencyHeader !== null) {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI is not set");
        await connectDb(uri);
      }

      if (options.rateLimit) {
        const limited = await hitRateLimit(
          // shortcut: keyed by path, so each dynamic segment gets its own bucket; add a bucket name when a dynamic route needs a shared one.
          `${request.method} ${url.pathname}|${clientIp(request)}`,
          options.rateLimit,
        );
        if (limited) {
          return fail(429, "rate_limited", {
            headers: { "Retry-After": String(limited.retryAfterSeconds) },
          });
        }
      }

      // Without `auth` the endpoint is public and A is null.
      const actor = (options.auth ? await options.auth(request) : null) as A;
      if (options.auth && actor === null) return fail(401, "unauthorized");

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

      await options.permission?.({ actor, input });

      if (idempotencyHeader !== null) {
        if (idempotencyHeader.length < 1 || idempotencyHeader.length > 255) {
          return fail(400, "validation_failed", {
            fields: { "Idempotency-Key": "invalid" },
          });
        }
        // Scoped per endpoint and caller, so nobody can replay another caller's response.
        const key = sha256(
          `${url.pathname}|${actor?.id ?? ""}|${idempotencyHeader}`,
        );
        const claim = await claimIdempotencyKey(key, sha256(bodyText));
        if (claim.kind === "replay") {
          return new Response(claim.response.body, {
            status: claim.response.status,
            headers: {
              "content-type": claim.response.contentType,
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

      const result = await fn({
        request,
        actor,
        input,
        params: await route.params,
        requestId,
      });
      const response =
        result instanceof Response ? result : Response.json({ data: result });

      if (claimedKey) {
        await storeIdempotentResponse(claimedKey, {
          status: response.status,
          contentType:
            response.headers.get("content-type") ?? "application/json",
          body: await response.clone().text(),
        });
        claimedKey = undefined;
      }
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      if (claimedKey) {
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
