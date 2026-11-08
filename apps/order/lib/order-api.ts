import type {
  CreateOrderInput,
  CreateOrderResponse,
  OrderQuoteResponse,
  OrderResponse,
  QuoteOrderInput,
  ReorderResponse,
} from "@namitiszunk/validators";
import type { TokenRequest } from "ably";

// shortcut: plain fetch instead of @namitiszunk/api-client, whose Zod schemas would add ~100 KB gzip to
// the guest bundle (150 KB budget); answers come from our own API. Switch back once api-client splits per endpoint.
const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** status 0: no network. `code` is the API's error code (e.g. "bar_paused"), when it sent one. */
export class OrderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`order api ${status}`);
  }
}

export async function send<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...headers,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The signed-in guest's session cookie (T-047): a new order joins their history, /v1/me reads it.
      credentials: "include",
    });
  } catch {
    throw new OrderApiError(0);
  }
  if (!res.ok) {
    const error = (await res.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new OrderApiError(res.status, error?.error?.code);
  }
  return ((await res.json()) as { data: T }).data;
}

const call = <T>(
  method: "GET" | "POST",
  path: string,
  guestToken: string,
  body?: unknown,
) => send<T>(method, path, { "x-guest-token": guestToken }, body);

export const orderApi = {
  /** The checkout summary, priced by the server (T-042). */
  quote: (input: QuoteOrderInput) =>
    send<OrderQuoteResponse>("POST", "/v1/orders/quote", {}, input),
  /** Same key, same order: a double tap or a retry never makes a second order. */
  create: (input: CreateOrderInput, idempotencyKey: string) =>
    send<CreateOrderResponse>(
      "POST",
      "/v1/orders",
      { "idempotency-key": idempotencyKey },
      input,
    ),
  get: (orderId: string, token: string) =>
    call<OrderResponse>(
      "GET",
      `/v1/orders/${encodeURIComponent(orderId)}`,
      token,
    ),
  cancel: (orderId: string, token: string) =>
    call<OrderResponse>(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      token,
    ),
  sendConfirmationEmail: (
    orderId: string,
    token: string,
    input: { email: string; locale: string },
  ) =>
    call<{ sent: true }>(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/confirmation-email`,
      token,
      input,
    ),
  reportProblem: (
    orderId: string,
    token: string,
    input: { category: string; message?: string; email?: string },
  ) =>
    call<{ reported: true }>(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/report`,
      token,
      input,
    ),
  review: (
    orderId: string,
    token: string,
    input: { stars: number; text?: string },
  ) =>
    call<{ reviewed: true }>(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/review`,
      token,
      input,
    ),
  /** "Rendeld újra" on the thanks page (T-045). */
  reorder: (orderId: string, token: string) =>
    call<ReorderResponse>(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/reorder`,
      token,
    ),
  realtimeToken: (token: string) =>
    call<TokenRequest>("POST", "/v1/realtime/token", token),
};
