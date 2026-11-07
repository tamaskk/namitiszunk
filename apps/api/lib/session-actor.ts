import "server-only";

import type { Actor } from "@namitiszunk/core/auth";

export type SessionActor = Actor & { id: string };

/**
 * The signed-in caller for `handler({ auth })`.
 * shortcut: no session exists yet, so every call is 401; wire to T-030's Better Auth session once merged.
 */
export async function sessionActor(): Promise<SessionActor | null> {
  return null;
}
