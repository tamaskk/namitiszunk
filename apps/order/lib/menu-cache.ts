import "server-only";

import { getPublicMenu, resolveMenuContext } from "@namitiszunk/core/menu";
import type { Locale } from "@namitiszunk/i18n";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

import { ensureDb } from "./db";

const menuTag = (venueId: string) => `menu:${venueId}`;

// Keyed only on server-resolved values: made-up QR ids cannot multiply cache entries.
// `menuVersion` is part of the key: an Admin menu change (another app, so no revalidateTag
// reaches here) makes the next page load miss the cache and read the new menu.
async function getCachedMenu(
  slug: string,
  locale: Locale,
  barId: string | null,
  isVip: boolean,
  menuVersion: number,
) {
  "use cache";
  // Read only as a cache key (see above).
  void menuVersion;
  await ensureDb();
  const menu = await getPublicMenu({ slug, locale, barId, isVip });
  if (menu) {
    cacheTag(menuTag(menu.venue.id));
    // A new menuVersion is a new entry; the hour only drops the old ones.
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
  return getCachedMenu(
    slug,
    locale,
    context.barId,
    context.isVip,
    context.menuVersion,
  );
}
