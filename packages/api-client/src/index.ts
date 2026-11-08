import {
  createOrderInputSchema,
  createOrderResponseSchema,
  errorResponseSchema,
  fieldErrorKeys,
  menuResponseSchema,
  objectIdSchema,
  openApiDocumentSchema,
  confirmationEmailInputSchema,
  confirmationEmailResponseSchema,
  orderResponseSchema,
  pingResponseSchema,
  realtimeTokenInputSchema,
  realtimeTokenResponseSchema,
  refundOrderInputSchema,
  refundResponseSchema,
} from "@namitiszunk/validators";
import { z } from "zod";

// Web platform APIs only (fetch, crypto.randomUUID, setTimeout); tsconfig leaves out Node types. Hermes has no crypto.randomUUID: the mobile app installs a polyfill (expo-crypto) before using orders.create.

type MaybePromise<T> = T | Promise<T>;

export type ApiClientOptions = {
  baseUrl: string;
  /** Bearer token of the signed-in user or guest; nothing is sent when it returns null or undefined. */
  getToken?: () => MaybePromise<string | null | undefined>;
  /** Caller scope for public idempotent endpoints (T-029): 22-128 chars of [A-Za-z0-9_-]. */
  getSessionId?: () => MaybePromise<string | null | undefined>;
  fetch?: typeof fetch;
};

/** `network_error` (status 0), `invalid_input` (status 0, caught before sending) and `invalid_response` are client-side codes; the rest come from the server. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageKey: string,
    readonly fields: Record<string, string> = {},
    readonly requestId: string | null = null,
  ) {
    super(`${code} (${status})`);
    this.name = "ApiError";
  }
}

const clientError = (
  status: number,
  code: string,
  requestId: string | null = null,
  fields: Record<string, string> = {},
) => new ApiError(status, code, `apiErrors.${code}`, fields, requestId);

const POST_RETRIES = 3;

function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status >= 500 ||
      // The first attempt may still be running on the server after its connection dropped.
      error.code === "idempotency_in_progress")
  );
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw clientError(0, "invalid_input", null, fieldErrorKeys(parsed.error));
  }
  return parsed.data as z.output<S>;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function request<S extends z.ZodType>(
    method: "GET" | "POST",
    path: string,
    responseSchema: S,
    {
      body,
      headers = {},
      bare = false,
    }: {
      body?: unknown;
      headers?: Record<string, string>;
      bare?: boolean;
    } = {},
  ): Promise<z.output<S>> {
    const token = await options.getToken?.();
    const allHeaders: Record<string, string> = {
      accept: "application/json",
      ...headers,
    };
    if (token) allHeaders.authorization = `Bearer ${token}`;
    if (body !== undefined) allHeaders["content-type"] = "application/json";

    let res: Response;
    try {
      // Looked up per call, so a fetch polyfill or mock installed after createApiClient is used.
      res = await (options.fetch ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method,
        headers: allHeaders,
        // The web apps' session cookie (parent domain in production) reaches the API only with credentials.
        credentials: "include",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw clientError(0, "network_error");
    }

    const requestId = res.headers.get("x-request-id");
    const json: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw clientError(res.status, "invalid_response", requestId);
      }
      const { code, messageKey, fields } = parsed.data.error;
      throw new ApiError(res.status, code, messageKey, fields, requestId);
    }

    // Success is `{ data }` (T-029); only the OpenAPI document is served bare.
    const parsed = responseSchema.safeParse(
      bare ? json : (json as { data?: unknown } | undefined)?.data,
    );
    if (!parsed.success) {
      throw clientError(res.status, "invalid_response", requestId);
    }
    return parsed.data as z.output<S>;
  }

  /** One Idempotency-Key for every attempt, so the server runs the request at most once. */
  async function postWithRetries<S extends z.ZodType>(
    path: string,
    responseSchema: S,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<z.output<S>> {
    const headers = {
      ...extraHeaders,
      "idempotency-key": crypto.randomUUID(),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        return await request("POST", path, responseSchema, { body, headers });
      } catch (error) {
        if (attempt >= POST_RETRIES || !isRetryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }

  const id = (value: string) =>
    encodeURIComponent(parseInput(objectIdSchema, value));

  return {
    ping: () => request("GET", "/v1/ping", pingResponseSchema),
    openApiDocument: () =>
      request("GET", "/v1/openapi.json", openApiDocumentSchema, { bare: true }),
    orders: {
      /** POST /v1/orders. Retries network errors and 5xx with the same Idempotency-Key, so a retry never makes a second order. */
      async create(input: z.input<typeof createOrderInputSchema>) {
        const body = parseInput(createOrderInputSchema, input);
        const sessionId = await options.getSessionId?.();
        const headers: Record<string, string> = {};
        if (sessionId) headers["x-session-id"] = sessionId;
        return postWithRetries(
          "/v1/orders",
          createOrderResponseSchema,
          body,
          headers,
        );
      },
      /** POST /v1/orders/{id}/refunds (staff session). Retries like `create`, so a retry never starts a second refund. */
      async refund(
        orderId: string,
        input: z.input<typeof refundOrderInputSchema>,
      ) {
        return postWithRetries(
          `/v1/orders/${id(orderId)}/refunds`,
          refundResponseSchema,
          parseInput(refundOrderInputSchema, input),
        );
      },
      /** GET /v1/orders/{id}: the guest's view of their order, proven by its guest token (T-043). */
      get: async (orderId: string, guestToken: string) =>
        request("GET", `/v1/orders/${id(orderId)}`, orderResponseSchema, {
          headers: { "x-guest-token": guestToken },
        }),
      /** POST /v1/orders/{id}/confirmation-email: at most 3 per order; not retried, a repeat would count twice. */
      sendConfirmationEmail: async (
        orderId: string,
        guestToken: string,
        input: z.input<typeof confirmationEmailInputSchema>,
      ) =>
        request(
          "POST",
          `/v1/orders/${id(orderId)}/confirmation-email`,
          confirmationEmailResponseSchema,
          {
            body: parseInput(confirmationEmailInputSchema, input),
            headers: { "x-guest-token": guestToken },
          },
        ),
      /** POST /v1/orders/{id}/cancel: the guest cancels before acceptance. Not retried: a repeat answers 409. */
      cancel: async (orderId: string, guestToken: string) =>
        request(
          "POST",
          `/v1/orders/${id(orderId)}/cancel`,
          orderResponseSchema,
          {
            headers: { "x-guest-token": guestToken },
          },
        ),
    },
    menu: {
      /** GET /v1/venues/{venueId}/menu. Not on the server yet (guest menu, T-040). */
      get: async (venueId: string) =>
        request("GET", `/v1/venues/${id(venueId)}/menu`, menuResponseSchema),
    },
    realtime: {
      /** POST /v1/realtime/token, for the Ably client's authCallback. A guest passes its order's guest token. */
      token: async (
        input: z.input<typeof realtimeTokenInputSchema> = {},
        guestToken?: string,
      ) =>
        request("POST", "/v1/realtime/token", realtimeTokenResponseSchema, {
          body: parseInput(realtimeTokenInputSchema, input),
          headers: guestToken ? { "x-guest-token": guestToken } : {},
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
