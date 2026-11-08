import "server-only";

import { guestActorFromToken } from "@namitiszunk/auth";

import { GUEST_TOKEN_HEADER } from "./realtime-caller";

/**
 * The guest of the order in `/v1/orders/{id}/...`, proven by its token in the x-guest-token header.
 * A missing or wrong token throws 404 (not 401), so the answer never tells whether the order exists.
 */
export function guestCaller(request: Request) {
  const orderId = new URL(request.url).pathname.split("/")[3] ?? "";
  return guestActorFromToken(orderId, request.headers.get(GUEST_TOKEN_HEADER));
}
