import "server-only";

import {
  getAuth,
  isStaffDevice,
  type RequestActor,
  staffActorFromRequest,
  userActorFromHeaders,
} from "@namitiszunk/auth";

import { originApp } from "./cors";

export type SessionActor = RequestActor;

/**
 * The signed-in caller for `handler({ auth })`, or null (401).
 * Browsers: the allowlisted Origin names the one app whose session cookie counts (parent-domain
 * cookies reach the API), so an admin session never counts for an HQ request. A request without
 * an allowlisted Origin never gets a cookie session: that is the CSRF check for state-changing calls.
 * The mobile app sends no Origin: only an order-app Bearer token counts, never a cookie.
 */
export async function getSessionActor(
  request: Request,
): Promise<SessionActor | null> {
  const origin = request.headers.get("origin");
  if (!origin) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    return userActorFromHeaders(
      await getAuth("order"),
      "order",
      new Headers({ authorization }),
    );
  }
  const app = originApp(origin);
  if (app !== "order" && app !== "admin" && app !== "hq") return null;
  // A registered bar tablet: only its PIN holder counts, never a member session left on it.
  if (app === "admin" && isStaffDevice(request))
    return staffActorFromRequest(request);
  return userActorFromHeaders(await getAuth(app), app, request.headers);
}
