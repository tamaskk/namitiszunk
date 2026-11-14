import "server-only";

import type { Actor } from "@namitiszunk/core/auth";
import { AppError } from "@namitiszunk/core/errors";
import { PlatformMember, VenueMember } from "@namitiszunk/db";
import { APIError } from "better-auth/api";

import { getAuth, type Auth, type AuthApp } from "./better-auth";

/**
 * An Actor plus the stable id the API wrapper scopes rate limits and idempotency keys by.
 * Request data can only ever produce guest, staff and user actors: `system` is built by the
 * Stripe webhook and Inngest code itself, and a platform role comes only from an active
 * PlatformMember behind a 2FA-verified HQ session.
 */
export type RequestActor = Exclude<Actor, { kind: "system" }> & { id: string };
type UserActor = Extract<RequestActor, { kind: "user" }>;

export const isObjectId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);

/**
 * The signed-in user of one app, or null. The session must have been created by the same app,
 * so an admin session is never valid in HQ (and the reverse), even if its token is replayed
 * under the other cookie name. Venue memberships count only in admin, the platform role only in HQ.
 */
export async function userActorFromHeaders(
  auth: Auth,
  app: AuthApp,
  headers: Headers,
): Promise<UserActor | null> {
  // A session of another app is refused by the auth hook (401): here that simply means no session.
  const result = await auth.api
    .getSession({ headers })
    .catch((error: unknown) => {
      if (error instanceof APIError && error.statusCode === 401) return null;
      throw error;
    });
  if (!result || result.session.app !== app) return null;
  const { user, session } = result;

  // HQ: someone without an active platform role (a club Owner) is refused before any 2FA step,
  // so they are never walked into setting up a factor here; with no role the actor may do nothing.
  const platformMember =
    app === "hq"
      ? await PlatformMember.findOne(
          { userId: user.id, isActive: true },
          { role: 1 },
        ).lean()
      : null;
  // An error, not an actor: every HQ actor has passed 2FA, so no route can take an unchecked one.
  if (app === "hq" && !platformMember)
    throw new AppError(403, "platform_role_required");

  // HQ: 2FA for every platform role (docs/SECURITY.md §03); elsewhere only once the user turned it on.
  if (app === "hq" && !user.twoFactorEnabled)
    throw new AppError(403, "two_factor_setup_required");
  if ((app === "hq" || user.twoFactorEnabled) && !session.twoFactorVerified)
    throw new AppError(403, "two_factor_required");

  const actor: UserActor = {
    kind: "user",
    id: `user:${user.id}`,
    userId: user.id,
    memberships: [],
    twoFactorVerified: session.twoFactorVerified === true,
  };
  if (app === "admin") {
    const members = await VenueMember.find(
      { userId: user.id, isActive: true },
      { venueId: 1, role: 1 },
    ).lean();
    actor.memberships = members.map((m) => ({
      venueId: String(m.venueId),
      memberId: String(m._id),
      role: m.role,
    }));
  }
  if (platformMember) actor.platformRole = platformMember.role;
  return actor;
}

/** For the API wrapper's `auth` option and server actions: the app's signed-in user, or null (401). */
export async function userActorFromRequest(
  app: AuthApp,
  request: Request,
): Promise<UserActor | null> {
  return userActorFromHeaders(await getAuth(app), app, request.headers);
}
