import "server-only";

import { getPublicMenu } from "@namitiszunk/core/menu";
import type { Locale } from "@namitiszunk/i18n";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { ensureDb } from "./db";

const menuTag = (venueId: string) => `menu:${venueId}`;

/**
 * The guest menu through the Next cache, tagged `menu:{venueId}`.
 * shortcut: every zone id is its own cache entry (the cache is LRU-bounded); key on the resolved zone if memory grows.
 */
export async function getCachedMenu(
  slug: string,
  locale: Locale,
  zoneId?: string,
  barId?: string,
) {
  "use cache";
  await ensureDb();
  const menu = await getPublicMenu({ slug, locale, zoneId, barId });
  if (menu) {
    cacheTag(menuTag(menu.venue.id));
  } else {
    // An unknown slug may go live soon; do not remember the miss for long.
    cacheLife("minutes");
  }
  return menu;
}

/** Drops the cached menu of a venue now; for menu edits (T-051) and the sold-out toggle (T-054). */
export function revalidateMenu(venueId: string): void {
  revalidateTag(menuTag(venueId), { expire: 0 });
}
