import "server-only";

import { getPublicMenu, resolveMenuContext } from "@namitiszunk/core/menu";
import type { Locale } from "@namitiszunk/i18n";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { connection } from "next/server";

import { ensureDb } from "./db";

const menuTag = (venueId: string) => `menu:${venueId}`;

// Keyed only on server-resolved values: made-up QR ids cannot multiply cache entries.
async function getCachedMenu(
  slug: string,
  locale: Locale,
  barId: string | null,
  isVip: boolean,
) {
  "use cache";
  await ensureDb();
  const menu = await getPublicMenu({ slug, locale, barId, isVip });
  if (menu) {
    cacheTag(menuTag(menu.venue.id));
    // Edits and sold-out switches revalidate the tag; the hour is only a safety net.
    cacheLife("hours");
  } else {
    // The venue went offline between the two reads; do not remember that for long.
    cacheLife("minutes");
  }
  return menu;
}

/**
 * The guest menu for a QR URL, or null for an unknown slug. The zone and bar are resolved
 * uncached (two indexed reads), so VIP access is always current; the menu itself is cached.
 */
export async function getMenu(
  slug: string,
  locale: Locale,
  zoneId?: string,
  barId?: string,
) {
  // The zone decides VIP access, so it is read per request, never prerendered.
  await connection();
  await ensureDb();
  const context = await resolveMenuContext({ slug, zoneId, barId });
  if (!context) return null;
  return getCachedMenu(slug, locale, context.barId, context.isVip);
}

/** Drops the cached menu of a venue now; for menu edits (T-051) and the sold-out toggle (T-054). */
export function revalidateMenu(venueId: string): void {
  revalidateTag(menuTag(venueId), { expire: 0 });
}
