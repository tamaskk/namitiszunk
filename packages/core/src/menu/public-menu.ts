import "server-only";

import { Bar, Category, Item, Types, Venue, Zone } from "@namitiszunk/db";
import type { Locale } from "@namitiszunk/i18n";

export type PublicMenuItem = {
  id: string;
  name: string;
  description: string | null;
  /** Integer forints. */
  priceHuf: number;
  imageUrl: string | null;
  soldOut: boolean;
};

export type PublicMenu = {
  venue: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    coverUrl: string | null;
  };
  bar: { id: string; name: string } | null;
  categories: { id: string; name: string; items: PublicMenuItem[] }[];
};

type Input = {
  slug: string;
  locale: Locale;
  /** From the QR code; callers pass only well-formed object ids. */
  zoneId?: string;
  barId?: string;
};

/** Only a live venue has a public menu; drafts and suspended venues read as unknown. */
export async function findPublicVenue(slug: string) {
  return Venue.findOne({ slug, status: "active" }).lean();
}

/**
 * The bar a guest orders from: the QR's bar, else the zone's bar, else the venue's first bar.
 * A bar of another venue is ignored, never trusted.
 * shortcut: a multi-bar venue without a bar in the URL gets its first bar; the picker is T-097.
 */
export async function resolveBar(venueId: Types.ObjectId, barId?: string) {
  if (barId) {
    const bar = await Bar.findOne({ _id: barId, venueId }).lean();
    if (bar) return bar;
  }
  return Bar.findOne({ venueId }).sort({ _id: 1 }).lean();
}

const localized = (
  hu: string,
  en: string | null | undefined,
  locale: Locale,
) => (locale === "en" && en ? en : hu);

/**
 * The guest menu of a venue in display order, or null for an unknown slug.
 * VIP items appear only when the server finds the zone in this venue and it is a VIP table,
 * so a missing, foreign or made-up zone id shows the regular menu.
 */
export async function getPublicMenu({
  slug,
  locale,
  zoneId,
  barId,
}: Input): Promise<PublicMenu | null> {
  const venue = await findPublicVenue(slug);
  if (!venue) return null;

  const zone = zoneId
    ? await Zone.findOne({ _id: zoneId, venueId: venue._id }).lean()
    : null;
  const isVip = zone?.type === "vip_table";
  const bar = await resolveBar(venue._id, barId ?? zone?.barId.toString());

  const [categories, items] = await Promise.all([
    Category.find({ venueId: venue._id, archivedAt: null })
      .sort({ sortOrder: 1, _id: 1 })
      .lean(),
    Item.find({
      venueId: venue._id,
      archivedAt: null,
      ...(isVip ? {} : { vipOnly: { $ne: true } }),
    })
      .sort({ sortOrder: 1, _id: 1 })
      .lean(),
  ]);

  // An item limited to some bars is only served at those bars.
  const servedHere = items.filter(
    (item) =>
      !item.barIds?.length ||
      (bar !== null && item.barIds.some((id) => id.equals(bar._id))),
  );

  return {
    venue: {
      id: venue._id.toString(),
      slug: venue.slug,
      name: venue.name,
      logoUrl: venue.branding?.logoUrl ?? null,
      coverUrl: venue.branding?.coverUrl ?? null,
    },
    bar: bar ? { id: bar._id.toString(), name: bar.name } : null,
    categories: categories
      .map((category) => ({
        id: category._id.toString(),
        name: localized(category.name, category.nameEn, locale),
        items: servedHere
          .filter((item) => item.categoryId.equals(category._id))
          .map((item) => ({
            id: item._id.toString(),
            name: localized(item.name, item.nameEn, locale),
            description:
              localized(item.description ?? "", item.descriptionEn, locale) ||
              null,
            priceHuf: item.priceHuf,
            imageUrl: item.imageUrl ?? null,
            soldOut: !item.isAvailable,
          })),
      }))
      .filter((category) => category.items.length > 0),
  };
}
