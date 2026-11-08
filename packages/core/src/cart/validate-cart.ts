import "server-only";

import { Item, Venue } from "@namitiszunk/db";
import type { ValidateCartInput } from "@namitiszunk/validators";

import { NotFoundError } from "../errors";
import { publicModifierGroups, resolveMenuContext } from "../menu/public-menu";
import {
  DEFAULT_MAX_ITEMS_PER_ORDER,
  optionsHufOf,
  validateSelection,
} from "./selection";

/** What changed for one cart line since the guest added it; `index` points into the input. */
export type CartLineProblem =
  | {
      index: number;
      itemId: string;
      code: "sold_out" | "archived" | "unavailable" | "invalid_options";
    }
  | {
      index: number;
      itemId: string;
      code: "price_changed";
      /** The current unit price with the chosen surcharges. */
      unitPriceHuf: number;
    };

export type CartValidation = {
  problems: CartLineProblem[];
  maxItemsPerOrder: number;
  /** The quantities add up to more than maxItemsPerOrder. */
  overLimit: boolean;
};

/**
 * Re-checks a cart against the database before checkout (T-041 "Tovább"): stock, archive,
 * VIP and bar access, the option rules, current prices and the item limit. The bar and zone are
 * resolved like the menu, so a made-up id never unlocks an item. createOrder checks it all again.
 */
export async function validateCart(
  input: ValidateCartInput,
): Promise<CartValidation> {
  const context = await resolveMenuContext({
    slug: input.slug,
    barId: input.barId,
    zoneId: input.zoneId,
  });
  if (!context) throw new NotFoundError();

  const [venue, items] = await Promise.all([
    Venue.findById(context.venueId).select("orderRules").lean(),
    Item.find({
      _id: { $in: input.items.map((line) => line.itemId) },
      venueId: context.venueId,
    })
      .select("priceHuf isAvailable archivedAt vipOnly barIds modifierGroups")
      .lean(),
  ]);
  const byId = new Map(items.map((item) => [String(item._id), item]));

  const problems = input.items.flatMap((line, index): CartLineProblem[] => {
    const item = byId.get(line.itemId);
    const at = { index, itemId: line.itemId };
    if (!item) return [{ ...at, code: "unavailable" }];
    const servedHere =
      (!item.vipOnly || context.isVip) &&
      (!item.barIds?.length ||
        item.barIds.some((id) => String(id) === context.barId));
    // Access first: a guest never learns whether an item hidden from them is archived.
    if (!servedHere) return [{ ...at, code: "unavailable" }];
    if (item.archivedAt) return [{ ...at, code: "archived" }];
    if (item.isAvailable === false) return [{ ...at, code: "sold_out" }];

    const groups = publicModifierGroups(item.modifierGroups, "hu");
    const modifierIds = line.modifierIds ?? [];
    if (validateSelection(groups, modifierIds).length > 0) {
      return [{ ...at, code: "invalid_options" }];
    }
    const unitPriceHuf = item.priceHuf + optionsHufOf(groups, modifierIds);
    return unitPriceHuf === line.unitPriceHuf
      ? []
      : [{ ...at, code: "price_changed", unitPriceHuf }];
  });

  const maxItemsPerOrder =
    venue?.orderRules?.maxItemsPerOrder ?? DEFAULT_MAX_ITEMS_PER_ORDER;
  const quantity = input.items.reduce((sum, line) => sum + line.quantity, 0);
  return { problems, maxItemsPerOrder, overLimit: quantity > maxItemsPerOrder };
}
