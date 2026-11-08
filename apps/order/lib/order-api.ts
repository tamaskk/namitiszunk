import type { OrderResponse } from "@namitiszunk/validators";
import type { TokenRequest } from "ably";

// shortcut: plain fetch instead of @namitiszunk/api-client, whose Zod schemas would add ~100 KB gzip to
// the guest bundle (150 KB budget); answers come from our own API. Switch back once api-client splits per endpoint.
const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** status 0: no network. */
export class OrderApiError extends Error {
  constructor(readonly status: number) {
    super(`order api ${status}`);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  guestToken: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        "x-guest-token": guestToken,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OrderApiError(0);
  }
  if (!res.ok) throw new OrderApiError(res.status);
  return ((await res.json()) as { data: T }).data;
}

export const orderApi = {
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
  realtimeToken: (token: string) =>
    call<TokenRequest>("POST", "/v1/realtime/token", token),
};
