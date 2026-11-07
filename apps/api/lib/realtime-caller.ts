import "server-only";

import {
  guestTokenMatches,
  hashGuestToken,
  type RequestActor,
} from "@namitiszunk/auth";

import { getSessionActor } from "./session-actor";

type Resolvers = {
  /** The staff (PIN holder) or signed-in user actor from the session, or null. */
  sessionActor: (request: Request) => Promise<RequestActor | null>;
  /** The guest token's hash (Order.guestTokenHash) when the token is well-formed, or null. */
  verifyGuestToken: (token: string) => Promise<string | null>;
};

export const GUEST_TOKEN_HEADER = "x-guest-token";

/** A signed-in session wins; otherwise a guest proves their order with its guest token. */
export function realtimeCallerFrom({
  sessionActor,
  verifyGuestToken,
}: Resolvers) {
  return async (request: Request): Promise<RequestActor | null> => {
    const session = await sessionActor(request);
    if (session) return session;
    const token = request.headers.get(GUEST_TOKEN_HEADER);
    const guestId = token ? await verifyGuestToken(token) : null;
    if (!guestId) return null;
    return { kind: "guest", id: `guest:${guestId}`, guestId };
  };
}

export const realtimeCaller = realtimeCallerFrom({
  sessionActor: getSessionActor,
  // Core's guestId is the token hash; createTokenRequest grants only the order stored under that hash.
  verifyGuestToken: async (token) => {
    const hash = hashGuestToken(token);
    return guestTokenMatches(token, hash) ? hash : null;
  },
});
