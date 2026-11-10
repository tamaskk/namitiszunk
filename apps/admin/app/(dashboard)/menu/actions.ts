"use server";

import {
  archiveCategory,
  archiveMenuItem,
  createCategory,
  createItem,
  duplicateItem,
  reorderMenu,
  setItemAvailable,
  updateCategory,
  updateItem,
} from "@namitiszunk/core/menu";
import {
  categoryInputSchema,
  itemInputSchema,
  menuIdInputSchema,
  reorderInputSchema,
  reorderItemsInputSchema,
  setAvailableInputSchema,
  updateCategoryInputSchema,
  updateItemInputSchema,
} from "@namitiszunk/validators";
import { getTranslations } from "next-intl/server";

import { runMenuAction as run } from "./run-menu-action";

export async function createCategoryAction(input: unknown) {
  return run(categoryInputSchema, input, (data, { actor, venueId }) =>
    createCategory(actor, venueId, data),
  );
}

export async function updateCategoryAction(input: unknown) {
  return run(updateCategoryInputSchema, input, ({ id, input }, c) =>
    updateCategory(c.actor, c.venueId, id, input).then(() => null),
  );
}

export async function archiveCategoryAction(input: unknown) {
  return run(menuIdInputSchema, input, ({ id }, c) =>
    archiveCategory(c.actor, c.venueId, id).then(() => null),
  );
}

export async function reorderCategoriesAction(input: unknown) {
  return run(reorderInputSchema, input, ({ ids }, c) =>
    reorderMenu(c.actor, c.venueId, { kind: "categories" }, ids).then(
      () => null,
    ),
  );
}

export async function reorderItemsAction(input: unknown) {
  return run(reorderItemsInputSchema, input, ({ ids, categoryId }, c) =>
    reorderMenu(c.actor, c.venueId, { kind: "items", categoryId }, ids).then(
      () => null,
    ),
  );
}

export async function createItemAction(input: unknown) {
  return run(itemInputSchema, input, (data, c) =>
    createItem(c.actor, c.venueId, data),
  );
}

export async function updateItemAction(input: unknown) {
  return run(updateItemInputSchema, input, ({ id, input }, c) =>
    updateItem(c.actor, c.venueId, id, input).then(() => null),
  );
}

export async function duplicateItemAction(input: unknown) {
  const t = await getTranslations("admin.menu");
  return run(menuIdInputSchema, input, ({ id }, c) =>
    duplicateItem(c.actor, c.venueId, id, (name) => t("copyName", { name })),
  );
}

export async function archiveItemAction(input: unknown) {
  return run(menuIdInputSchema, input, ({ id }, c) =>
    archiveMenuItem(c.actor, c.venueId, id).then(() => null),
  );
}

export async function setItemAvailableAction(input: unknown) {
  return run(setAvailableInputSchema, input, ({ id, available }, c) =>
    setItemAvailable(c.actor, c.venueId, id, available).then(() => null),
  );
}
