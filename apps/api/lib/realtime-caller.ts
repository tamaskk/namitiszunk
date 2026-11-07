import "server-only";

import type { Actor } from "@namitiszunk/core/auth";

/** The handler needs an id to rate limit by; the service needs the actor. */
export type RealtimeCaller = { id: string; actor: Actor };

type Resolvers = {
  /** The staff (PIN holder) or signed-in user actor from the session, or null. */
  sessionActor: (request: Request) => Promise<Actor | null>;
  /** The guest token's hash (Order.guestTokenHash) when the token is genuine, or null. */
  verifyGuestToken: (token: string) => Promise<string | null>;
};

export const GUEST_TOKEN_HEADER = "x-guest-token";

function idOf(actor: Actor): string {
  switch (actor.kind) {
    case "staff":
      return `member:${actor.memberId}`;
    case "user":
      return `user:${actor.userId}`;
    case "guest":
      return `guest:${actor.guestId}`;
    case "system":
      return `system:${actor.source}`;
  }
}

/** A signed-in session wins; otherwise a guest proves their order with its guest token. */
export function realtimeCallerFrom({
  sessionActor,
  verifyGuestToken,
}: Resolvers) {
  return async (request: Request): Promise<RealtimeCaller | null> => {
    const session = await sessionActor(request);
    if (session) return { id: idOf(session), actor: session };
    const token = request.headers.get(GUEST_TOKEN_HEADER);
    const guestId = token ? await verifyGuestToken(token) : null;
    if (!guestId) return null;
    const actor: Actor = { kind: "guest", guestId };
    return { id: idOf(actor), actor };
  };
}

// shortcut: no session or guest token helpers exist yet, so every caller gets 401; wire T-030's actor builders and guest token verification here once merged.
export const realtimeCaller = realtimeCallerFrom({
  sessionActor: async () => null,
  verifyGuestToken: async () => null,
});
