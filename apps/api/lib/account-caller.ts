import "server-only";

import { originApp } from "./cors";
import { getSessionActor } from "./session-actor";

/**
 * The signed-in guest for `/v1/me/...` (T-047): an order-app session (cookie from the order app, or
 * the mobile app's Bearer token), never a staff PIN or an admin or HQ session.
 */
export async function accountCaller(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && originApp(origin) !== "order") return null;
  const actor = await getSessionActor(request);
  return actor?.kind === "user" ? actor : null;
}
