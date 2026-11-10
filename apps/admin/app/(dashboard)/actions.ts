"use server";

import { setVenueOrdersPaused } from "@namitiszunk/core/admin";
import { Forbidden } from "@namitiszunk/core/auth";
import {
  selectVenueSchema,
  setOrdersPausedSchema,
} from "@namitiszunk/validators";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getAdminContext, VENUE_COOKIE } from "@/lib/admin-context";

type ActionResult = { ok: true } | { error: { code: string } };

/** The top bar's Open / Paused switch: every bar of the shown venue, no time limit, audited in core. */
export async function setOrdersPausedAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = setOrdersPausedSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "validation_failed" } };
  // The venue the user is looking at, not the cookie another tab may have switched since.
  // It is only an id: core checks this user's membership and role for it (venue.pauseOrders).
  const { actor } = await getAdminContext();
  try {
    await setVenueOrdersPaused(actor, parsed.data);
  } catch (error) {
    if (error instanceof Forbidden) return { error: { code: "forbidden" } };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The venue switcher: remembers a venue the user is a member of. */
export async function selectVenueAction(input: unknown): Promise<ActionResult> {
  const parsed = selectVenueSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "validation_failed" } };
  const { venues } = await getAdminContext();
  if (!venues.some((v) => v.id === parsed.data.venueId))
    return { error: { code: "forbidden" } };
  (await cookies()).set(VENUE_COOKIE, parsed.data.venueId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
