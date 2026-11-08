import type {
  AccountOrder,
  ReorderResponse,
} from "@namitiszunk/validators";

import { send } from "./order-api";

/** The signed-in guest's own account on apps/api (T-047); the session cookie goes along. */
export const meApi = {
  orders: () => send<AccountOrder[]>("GET", "/v1/me/orders", {}),
  claimOrders: (orders: { orderId: string; token: string }[]) =>
    send<{ claimed: number }>("POST", "/v1/me/orders/claim", {}, { orders }),
  reorder: (orderId: string) =>
    send<ReorderResponse>(
      "POST",
      `/v1/me/orders/${encodeURIComponent(orderId)}/reorder`,
      {},
    ),
  export: () => send<unknown>("GET", "/v1/me/export", {}),
  delete: () => send<{ ordersDetached: number }>("DELETE", "/v1/me", {}),
};

async function auth(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Better Auth on the order app's own origin (T-030): its cookie is the order app's session. */
export const authApi = {
  /** true when the e-mail went out; 429 and other refusals give false. */
  async sendMagicLink(email: string, callbackURL: string): Promise<boolean> {
    const res = await auth("/sign-in/magic-link", { email, callbackURL }).catch(
      () => null,
    );
    return res?.ok ?? false;
  },
  /** Google or Apple: the browser leaves for the provider; null when the start failed. */
  async socialUrl(
    provider: "google" | "apple",
    callbackURL: string,
  ): Promise<string | null> {
    const res = await auth("/sign-in/social", {
      provider,
      callbackURL,
      disableRedirect: true,
    }).catch(() => null);
    if (!res?.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  },
  signOut: () => auth("/sign-out", {}).catch(() => null),
};
