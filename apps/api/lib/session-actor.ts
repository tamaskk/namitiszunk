import "server-only";

import type { Actor } from "@namitiszunk/core/auth";

/** The signed-in caller, with `id` scoping rate limits and idempotency keys in handler(). */
export type SessionActor = Actor & { id: string };

// shortcut: no session yet, so every protected route answers 401; wire to T-030's session actor once merged.
export async function getSessionActor(): Promise<SessionActor | null> {
  return null;
}
