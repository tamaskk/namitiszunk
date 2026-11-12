import "server-only";

import {
  Bar,
  Category,
  DEFAULT_TIP_PRESETS_BPS,
  Item,
  type ItemDoc,
  Types,
  Venue,
  Zone,
} from "@namitiszunk/db";
import type { Locale } from "@namitiszunk/i18n";

import {
  DEFAULT_MAX_ITEMS_PER_ORDER,
  type SelectableGroup,
} from "../cart/selection";
import { accentIsReadable } from "../settings/contrast";

export type PublicModifierGroup = Omit<SelectableGroup, "modifiers"> & {
  name: string;
  modifiers: { id: string; name: string; priceDeltaHuf: number }[];
};

export type PublicMenuItem = {
  id: string;
  name: string;
  description: string | null;
  /** Integer forints. */
  priceHuf: number;
  imageUrl: string | null;
  soldOut: boolean;
  modifierGroups: PublicModifierGroup[];
};

export type PublicMenu = {
  venue: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    coverUrl: string | null;
    /** The venue's item limit, DEFAULT_MAX_ITEMS_PER_ORDER when unset. */
    maxItemsPerOrder: number;
    /** The venue accent when readable on the dark background (T-058); null: the default accent. */
    accentColor: string | null;
    /** The checkout's tip buttons in basis points; null: this venue takes no tips. */
    tipPresetsBps: number[] | null;
  };
  bar: { id: string; name: string } | null;
  categories: { id: string; name: string; items: PublicMenuItem[] }[];
};

export type MenuContext = {
  venueId: string;
  /** The bar the guest orders from, resolved on the server; null when the venue has no bar. */
  barId: string | null;
  /** True only for a VIP table zone of this venue at the resolved bar. */
  isVip: boolean;
  /** Raised by every Admin menu change (T-051); the order app keys its menu cache on it. */
  menuVersion: number;
};

/** A venue that exists but takes no orders yet (draft) or any more (suspended), for its own page (T-048). */
export async function isInactiveVenue(slug: string): Promise<boolean> {
  return (await Venue.exists({ slug, status: { $ne: "active" } })) !== null;
}

/** Only a live venue has a public menu; drafts and suspended venues read as unknown. */
export async function findPublicVenue(slug: string) {
  return Venue.findOne({ slug, status: "active" }).lean();
}

/**
 * The bar a guest orders from: the QR's bar, else the venue's first bar.
 * A bar of another venue is ignored, never trusted.
 * shortcut: a multi-bar venue without a bar in the URL gets its first bar; the picker is T-097.
 */
export async function resolveBar(
  venueId: Types.ObjectId,
  barId?: string | Types.ObjectId,
) {
  if (barId) {
    const bar = await Bar.findOne({ _id: barId, venueId }).lean();
    if (bar) return bar;
  }
  return Bar.findOne({ venueId }).sort({ _id: 1 }).lean();
}

/**
 * Turns the QR parameters into trusted values, or null for an unknown slug. Without a bar the
 * zone's bar is used; a zone of another venue or another bar is ignored, as in createOrder,
 * so a missing, foreign or made-up zone id never unlocks VIP items.
 */
export async function resolveMenuContext({
  slug,
  zoneId,
  barId,
}: {
  slug: string;
  /** From the QR code; callers pass only well-formed object ids. */
  zoneId?: string;
  barId?: string;
}): Promise<MenuContext | null> {
  const venue = await findPublicVenue(slug);
  if (!venue) return null;
  const zone = zoneId
    ? await Zone.findOne({ _id: zoneId, venueId: venue._id })
        .select("barId type")
        .lean()
    : null;
  const bar = await resolveBar(venue._id, barId ?? zone?.barId);
  return {
    venueId: venue._id.toString(),
    barId: bar?._id.toString() ?? null,
    isVip:
      bar !== null && zone?.type === "vip_table" && zone.barId.equals(bar._id),
    menuVersion: venue.menuVersion ?? 0,
  };
}

const localized = (
  hu: string,
  en: string | null | undefined,
  locale: Locale,
) => (locale === "en" && en ? en : hu);

// Subdocuments get an _id from Mongoose; the inferred type leaves it out.
const idOf = (doc: object) => String((doc as { _id?: unknown })._id);

/** An item's stored modifier groups with ids and schema defaults filled in; the server rules use the "hu" names. */
export function publicModifierGroups(
  groups: ItemDoc["modifierGroups"] | undefined,
  locale: Locale,
): PublicModifierGroup[] {
  return (groups ?? []).map((group) => ({
    id: idOf(group),
    name: localized(group.name, group.nameEn, locale),
    required: group.required ?? false,
    minSelect: group.minSelect ?? 0,
    maxSelect: group.maxSelect ?? 1,
    modifiers: group.modifiers.map((m) => ({
      id: idOf(m),
      name: localized(m.name, m.nameEn, locale),
      priceDeltaHuf: m.priceDeltaHuf ?? 0,
    })),
  }));
}

/**
 * The guest menu of a venue in display order, or null for an unknown slug. `barId` and `isVip`
 * must come from resolveMenuContext, never straight from the URL; they are few distinct values,
 * so the page can cache on them.
 */
export async function getPublicMenu({
  slug,
  locale,
  barId,
  isVip,
}: {
  slug: string;
  locale: Locale;
  barId: string | null;
  isVip: boolean;
}): Promise<PublicMenu | null> {
  const venue = await findPublicVenue(slug);
  if (!venue) return null;
  const bar = barId
    ? await Bar.findOne({ _id: barId, venueId: venue._id })
        .select("name")
        .lean()
    : null;

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
      maxItemsPerOrder:
        venue.orderRules?.maxItemsPerOrder ?? DEFAULT_MAX_ITEMS_PER_ORDER,
      accentColor:
        venue.branding?.accentColor &&
        accentIsReadable(venue.branding.accentColor)
          ? venue.branding.accentColor
          : null,
      tipPresetsBps:
        venue.orderRules?.tips?.enabled === false
          ? null
          : venue.orderRules?.tips?.presetsBps?.length
            ? [...venue.orderRules.tips.presetsBps]
            : [...DEFAULT_TIP_PRESETS_BPS],
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
            modifierGroups: publicModifierGroups(item.modifierGroups, locale),
          })),
      }))
      .filter((category) => category.items.length > 0),
  };
}
