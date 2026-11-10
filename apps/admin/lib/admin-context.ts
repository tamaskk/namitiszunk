import "server-only";

import { getAuth, userActorFromHeaders } from "@namitiszunk/auth";
import {
  type AdminModuleKey,
  type AdminVenue,
  canOpenModule,
  listAdminVenues,
} from "@namitiszunk/core/admin";
import { AppError } from "@namitiszunk/core/errors";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { ensureDb } from "./db";

/** The venue switcher's choice; only ever read back against the user's own memberships. */
// __Host- in production: no sibling subdomain can set it on the parent domain (needs HTTPS).
export const VENUE_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-nmi-admin.venue"
    : "nmi-admin.venue";

type UserActor = NonNullable<Awaited<ReturnType<typeof userActorFromHeaders>>>;

export type AdminContext = {
  actor: UserActor;
  venues: AdminVenue[];
  /** null when the user belongs to no venue yet. */
  venue: AdminVenue | null;
};

/**
 * The signed-in club member and the venue they work in, from the request headers and the venue
 * cookie. "signedOut" without a session, "twoFactor" while the session still waits for its code.
 */
export async function loadAdminContext(
  requestHeaders: Headers,
  chosenVenueId: string | undefined,
): Promise<AdminContext | "signedOut" | "twoFactor"> {
  await ensureDb();
  let actor: UserActor | null;
  try {
    actor = await userActorFromHeaders(
      await getAuth("admin"),
      "admin",
      requestHeaders,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "two_factor_required")
      return "twoFactor";
    throw error;
  }
  if (!actor) return "signedOut";
  const venues = await listAdminVenues(actor);
  const venue = venues.find((v) => v.id === chosenVenueId) ?? venues[0] ?? null;
  return { actor, venues, venue };
}

/** Whether the context may open a module: the proxy's and the pages' one rule. */
export function contextCanOpen(
  context: AdminContext,
  key: AdminModuleKey,
): context is AdminContext & { venue: AdminVenue } {
  return (
    context.venue !== null &&
    canOpenModule(context.actor, key, context.venue.id)
  );
}

/** getAdminContext for pages, layouts and actions, once per request; no session sends to sign-in. */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const context = await loadAdminContext(
    await headers(),
    (await cookies()).get(VENUE_COOKIE)?.value,
  );
  if (context === "signedOut") redirect("/sign-in");
  if (context === "twoFactor") redirect("/sign-in?step=2fa");
  return context;
});

/**
 * The check at the top of every Admin page. proxy.ts already answered a forbidden URL with 403
 * before rendering; this second check covers anything the proxy matcher misses.
 */
export async function requireAdminModule(
  key: AdminModuleKey,
): Promise<AdminContext & { venue: AdminVenue }> {
  const context = await getAdminContext();
  if (!contextCanOpen(context, key)) forbidden();
  return context;
}
