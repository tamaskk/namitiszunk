import "server-only";

import {
  Bar,
  Category,
  type ClientSession,
  Item,
  type ItemDoc,
  Venue,
} from "@namitiszunk/db";
import type { CategoryInput, ItemInput } from "@namitiszunk/validators";

import { audit, auditActorOf } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { isVenueBlobUrl } from "../uploads/blob";

// The Admin menu module (T-051). Every change runs in one transaction with its audit entry and
// raises Venue.menuVersion, which the order app's menu cache is keyed on: a new page load
// shows the change. Items are archived, never deleted (ARCHITECTURE §06); past orders keep
// their own snapshot of name and price.

export type AdminMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  priceHuf: number;
  vatRate: ItemDoc["vatRate"];
  imageUrl: string | null;
  alcoholPercent: number | null;
  allergens: NonNullable<ItemInput["allergens"]>;
  isAvailable: boolean;
  barIds: string[];
  modifierGroups: NonNullable<ItemInput["modifierGroups"]>;
};

export type AdminMenu = {
  categories: {
    id: string;
    name: string;
    nameEn: string | null;
    vipOnly: boolean;
    items: AdminMenuItem[];
  }[];
  bars: { id: string; name: string }[];
};

async function inTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await Venue.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

/**
 * The order app caches the guest menu under `menuVersion` (T-051): any write that changes what a
 * guest sees (items, categories, bars, sold out) must call this in its transaction, or guests keep
 * the old menu.
 */
export async function bumpMenuVersion(
  venueId: string,
  session: ClientSession,
): Promise<void> {
  await Venue.updateOne(
    { _id: venueId },
    { $inc: { menuVersion: 1 } },
    { session },
  );
}

/** The audit entry plus the cache bump that every menu change shares. */
async function recordChange(
  session: ClientSession,
  actor: Actor,
  venueId: string,
  entry: {
    action: string;
    type: string;
    id: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await bumpMenuVersion(venueId, session);
  await audit(session, {
    actor: auditActorOf(actor),
    venueId,
    action: entry.action,
    target: { type: entry.type, id: entry.id },
    before: entry.before,
    after: entry.after,
  });
}

function toAdminItem(item: ItemDoc & { _id: unknown }): AdminMenuItem {
  return {
    id: String(item._id),
    categoryId: String(item.categoryId),
    name: item.name,
    nameEn: item.nameEn ?? null,
    description: item.description ?? null,
    descriptionEn: item.descriptionEn ?? null,
    priceHuf: item.priceHuf,
    vatRate: item.vatRate,
    imageUrl: item.imageUrl ?? null,
    alcoholPercent: item.alcoholPercent ?? null,
    allergens: item.allergens ?? [],
    isAvailable: item.isAvailable ?? true,
    barIds: (item.barIds ?? []).map(String),
    modifierGroups: (item.modifierGroups ?? []).map((g) => ({
      name: g.name,
      nameEn: g.nameEn ?? undefined,
      required: g.required ?? false,
      minSelect: g.minSelect ?? 0,
      maxSelect: g.maxSelect ?? 1,
      modifiers: g.modifiers.map((m) => ({
        name: m.name,
        nameEn: m.nameEn ?? undefined,
        priceDeltaHuf: m.priceDeltaHuf ?? 0,
      })),
    })),
  };
}

/** The whole live menu of a venue for the editor, archived items left out, plus its bars. */
export async function getAdminMenu(
  actor: Actor,
  venueId: string,
): Promise<AdminMenu> {
  requirePermission(actor, "menu.edit", { venueId });
  const [categories, items, bars] = await Promise.all([
    Category.find({ venueId, archivedAt: null })
      .sort({ sortOrder: 1, _id: 1 })
      .lean(),
    Item.find({ venueId, archivedAt: null })
      .sort({ sortOrder: 1, _id: 1 })
      .lean(),
    Bar.find({ venueId }, { name: 1 }).sort({ _id: 1 }).lean(),
  ]);
  return {
    categories: categories.map((c) => ({
      id: String(c._id),
      name: c.name,
      nameEn: c.nameEn ?? null,
      vipOnly: c.vipOnly ?? false,
      items: items
        .filter((i) => i.categoryId.equals(c._id))
        .map((i) => toAdminItem(i)),
    })),
    bars: bars.map((b) => ({ id: String(b._id), name: b.name })),
  };
}

async function nextSortOrder(
  model: typeof Category | typeof Item,
  filter: Record<string, unknown>,
  session: ClientSession,
): Promise<number> {
  const last = await (model as typeof Category)
    .findOne(filter, { sortOrder: 1 })
    .sort({ sortOrder: -1 })
    .session(session)
    .lean();
  return (last?.sortOrder ?? -1) + 1;
}

/**
 * A live category of the venue, touched inside the transaction: an archive and a new item in the
 * same category then write the same document, so one of them retries and sees the other.
 */
async function loadCategory(
  venueId: string,
  categoryId: string,
  session: ClientSession,
) {
  const category = await Category.findOneAndUpdate(
    { _id: categoryId, venueId, archivedAt: null },
    { $set: { updatedAt: new Date() } },
    { session, timestamps: false },
  ).lean();
  if (!category) throw new NotFoundError();
  return category;
}

/** Bars must belong to the venue; an empty list means every bar. */
async function assertOwnBars(
  venueId: string,
  barIds: string[] | undefined,
  session: ClientSession,
): Promise<void> {
  if (!barIds?.length) return;
  const count = await Bar.countDocuments({
    _id: { $in: barIds },
    venueId,
  }).session(session);
  if (count !== new Set(barIds).size) throw new NotFoundError();
}

export async function createCategory(
  actor: Actor,
  venueId: string,
  input: CategoryInput,
): Promise<{ id: string }> {
  requirePermission(actor, "menu.edit", { venueId });
  return inTransaction(async (session) => {
    const sortOrder = await nextSortOrder(
      Category,
      { venueId, archivedAt: null },
      session,
    );
    const [category] = await Category.create(
      [
        {
          venueId,
          name: input.name,
          nameEn: input.nameEn,
          vipOnly: input.vipOnly ?? false,
          sortOrder,
        },
      ],
      { session },
    );
    const id = String(category!._id);
    await recordChange(session, actor, venueId, {
      action: "menu.categoryCreated",
      type: "category",
      id,
      after: input,
    });
    return { id };
  });
}

/** Renames a category or flips "VIP only"; the flag is mirrored onto its items in the same write. */
export async function updateCategory(
  actor: Actor,
  venueId: string,
  categoryId: string,
  input: CategoryInput,
): Promise<void> {
  requirePermission(actor, "menu.edit", { venueId });
  await inTransaction(async (session) => {
    const before = await loadCategory(venueId, categoryId, session);
    const vipOnly = input.vipOnly ?? before.vipOnly ?? false;
    await Category.updateOne(
      { _id: categoryId, venueId },
      { $set: { name: input.name, nameEn: input.nameEn, vipOnly } },
      { session },
    );
    if (vipOnly !== (before.vipOnly ?? false)) {
      await Item.updateMany(
        { venueId, categoryId },
        { $set: { vipOnly } },
        { session },
      );
    }
    await recordChange(session, actor, venueId, {
      action: "menu.categoryUpdated",
      type: "category",
      id: categoryId,
      before: {
        name: before.name,
        nameEn: before.nameEn,
        vipOnly: before.vipOnly,
      },
      after: { name: input.name, nameEn: input.nameEn, vipOnly },
    });
  });
}

/** Hides an empty category for good; one with live items is refused, so nothing vanishes by accident. */
export async function archiveCategory(
  actor: Actor,
  venueId: string,
  categoryId: string,
): Promise<void> {
  requirePermission(actor, "menu.edit", { venueId });
  await inTransaction(async (session) => {
    await loadCategory(venueId, categoryId, session);
    const live = await Item.countDocuments({
      venueId,
      categoryId,
      archivedAt: null,
    }).session(session);
    if (live > 0) throw new ConflictError("category_not_empty");
    await Category.updateOne(
      { _id: categoryId, venueId },
      { $set: { archivedAt: new Date() } },
      { session },
    );
    await recordChange(session, actor, venueId, {
      action: "menu.categoryArchived",
      type: "category",
      id: categoryId,
    });
  });
}

/** Sets the order of the given ids; every id must be a live one of the venue (and the category, for items). */
export async function reorderMenu(
  actor: Actor,
  venueId: string,
  target: { kind: "categories" } | { kind: "items"; categoryId: string },
  ids: string[],
): Promise<void> {
  requirePermission(actor, "menu.edit", { venueId });
  await inTransaction(async (session) => {
    const filter = {
      venueId,
      archivedAt: null,
      ...(target.kind === "items" ? { categoryId: target.categoryId } : {}),
    };
    const model = (
      target.kind === "items" ? Item : Category
    ) as typeof Category;
    const live = await model.find(filter, { _id: 1 }).session(session).lean();
    const liveIds = new Set(live.map((d) => String(d._id)));
    // A stale list (another editor added or archived one meanwhile) is refused, not half-applied.
    if (
      ids.length !== liveIds.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => liveIds.has(id))
    )
      throw new ConflictError("menu_changed");
    await model.bulkWrite(
      ids.map((id, sortOrder) => ({
        updateOne: {
          filter: { _id: id, venueId },
          update: { $set: { sortOrder } },
        },
      })),
      { session },
    );
    await recordChange(session, actor, venueId, {
      action:
        target.kind === "items"
          ? "menu.itemsReordered"
          : "menu.categoriesReordered",
      type: target.kind === "items" ? "category" : "venue",
      id: target.kind === "items" ? target.categoryId : venueId,
      after: { ids },
    });
  });
}

/** A new image must be one we issued for this venue's products; an unchanged one is kept as is. */
function assertOwnImage(
  venueId: string,
  url: string | undefined,
  current: string | null,
): void {
  if (!url || url === current) return;
  if (!isVenueBlobUrl(url, venueId, "product"))
    throw new AppError(400, "validation_failed", {
      imageUrl: "validation.invalid",
    });
}

export async function createItem(
  actor: Actor,
  venueId: string,
  input: ItemInput,
): Promise<{ id: string }> {
  requirePermission(actor, "menu.edit", { venueId });
  return inTransaction(async (session) => {
    const category = await loadCategory(venueId, input.categoryId, session);
    await assertOwnBars(venueId, input.barIds, session);
    assertOwnImage(venueId, input.imageUrl, null);
    const sortOrder = await nextSortOrder(
      Item,
      { venueId, categoryId: input.categoryId, archivedAt: null },
      session,
    );
    const [item] = await Item.create(
      [
        {
          ...input,
          venueId,
          vipOnly: category.vipOnly ?? false,
          isAvailable: input.isAvailable ?? true,
          sortOrder,
        },
      ],
      { session },
    );
    const id = String(item!._id);
    await recordChange(session, actor, venueId, {
      action: "menu.itemCreated",
      type: "item",
      id,
      after: input,
    });
    return { id };
  });
}

/** Saves the whole item form; moving it to another category takes that category's VIP flag. */
export async function updateItem(
  actor: Actor,
  venueId: string,
  itemId: string,
  input: ItemInput,
): Promise<void> {
  requirePermission(actor, "menu.edit", { venueId });
  await inTransaction(async (session) => {
    const before = await Item.findOne({
      _id: itemId,
      venueId,
      archivedAt: null,
    })
      .session(session)
      .lean();
    if (!before) throw new NotFoundError();
    const category = await loadCategory(venueId, input.categoryId, session);
    await assertOwnBars(venueId, input.barIds, session);
    assertOwnImage(venueId, input.imageUrl, before.imageUrl ?? null);
    const moved = !before.categoryId.equals(category._id);
    const sortOrder = moved
      ? await nextSortOrder(
          Item,
          { venueId, categoryId: input.categoryId, archivedAt: null },
          session,
        )
      : before.sortOrder;
    // Optional fields left empty in the form are removed, not kept from before.
    const unset = Object.fromEntries(
      (
        [
          "nameEn",
          "description",
          "descriptionEn",
          "imageUrl",
          "alcoholPercent",
        ] as const
      )
        .filter((key) => input[key] === undefined)
        .map((key) => [key, 1]),
    );
    await Item.updateOne(
      { _id: itemId, venueId },
      {
        $set: {
          ...input,
          // Sold out belongs to the one-tap switch: a form opened before it was flipped must not undo it.
          isAvailable: before.isAvailable ?? true,
          allergens: input.allergens ?? [],
          barIds: input.barIds ?? [],
          modifierGroups: input.modifierGroups ?? [],
          vipOnly: category.vipOnly ?? false,
          sortOrder,
        },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { session, runValidators: true },
    );
    await recordChange(session, actor, venueId, {
      action: "menu.itemUpdated",
      type: "item",
      id: itemId,
      before: toAdminItem(before),
      after: { ...input, isAvailable: before.isAvailable ?? true },
    });
  });
}

// Same limit as nameSchema in @namitiszunk/validators: the copy skips the form, not the rule.
const NAME_MAX = 100;

/** "<name> (copy)" within the name limit: the original is shortened, the suffix stays readable. */
function copyNameWithin(copyName: (name: string) => string, name: string) {
  const overflow = copyName(name).length - NAME_MAX;
  return overflow > 0
    ? copyName(`${name.slice(0, name.length - overflow - 1)}…`)
    : copyName(name);
}

/** A copy right below the original, named "<name> (copy)" by the caller's translation. */
export async function duplicateItem(
  actor: Actor,
  venueId: string,
  itemId: string,
  copyName: (name: string) => string,
): Promise<{ id: string }> {
  requirePermission(actor, "menu.edit", { venueId });
  return inTransaction(async (session) => {
    const source = await Item.findOne({
      _id: itemId,
      venueId,
      archivedAt: null,
    })
      .session(session)
      .lean();
    if (!source) throw new NotFoundError();
    // Make room right after the source so the copy appears next to it.
    await Item.updateMany(
      {
        venueId,
        categoryId: source.categoryId,
        sortOrder: { $gt: source.sortOrder },
      },
      { $inc: { sortOrder: 1 } },
      { session },
    );
    // Only the menu fields: a new _id and fresh timestamps come from create.
    const { id: sourceId, ...fields } = toAdminItem(source);
    const [copy] = await Item.create(
      [
        {
          ...fields,
          venueId,
          vipOnly: source.vipOnly ?? false,
          name: copyNameWithin(copyName, source.name),
          nameEn: source.nameEn
            ? copyNameWithin(copyName, source.nameEn)
            : undefined,
          description: fields.description ?? undefined,
          descriptionEn: fields.descriptionEn ?? undefined,
          imageUrl: fields.imageUrl ?? undefined,
          alcoholPercent: fields.alcoholPercent ?? undefined,
          sortOrder: source.sortOrder + 1,
        },
      ],
      { session },
    );
    const id = String(copy!._id);
    await recordChange(session, actor, venueId, {
      action: "menu.itemDuplicated",
      type: "item",
      id,
      after: { from: sourceId },
    });
    return { id };
  });
}

/** Archives an item: gone from the menu for good, past orders keep their own snapshot. */
export async function archiveMenuItem(
  actor: Actor,
  venueId: string,
  itemId: string,
): Promise<void> {
  requirePermission(actor, "menu.edit", { venueId });
  await inTransaction(async (session) => {
    const archived = await Item.updateOne(
      { _id: itemId, venueId, archivedAt: null },
      { $set: { archivedAt: new Date(), isAvailable: false } },
      { session },
    );
    if (archived.matchedCount !== 1) throw new NotFoundError();
    await recordChange(session, actor, venueId, {
      action: "menu.itemArchived",
      type: "item",
      id: itemId,
    });
  });
}

/** The one-tap sold-out switch in the list; bartenders may use it too (product.setSoldOut). */
export async function setItemAvailable(
  actor: Actor,
  venueId: string,
  itemId: string,
  available: boolean,
): Promise<void> {
  requirePermission(actor, "product.setSoldOut", { venueId });
  await inTransaction(async (session) => {
    const changed = await Item.findOneAndUpdate(
      { _id: itemId, venueId, archivedAt: null },
      { $set: { isAvailable: available } },
      { session, projection: { isAvailable: 1 } },
    ).lean();
    if (!changed) throw new NotFoundError();
    if ((changed.isAvailable ?? true) === available) return;
    await recordChange(session, actor, venueId, {
      action: available ? "menu.itemAvailable" : "menu.itemSoldOut",
      type: "item",
      id: itemId,
      before: { isAvailable: changed.isAvailable },
      after: { isAvailable: available },
    });
  });
}
