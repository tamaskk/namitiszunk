"use server";

import { AppError } from "@namitiszunk/core/errors";
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
import { revalidatePath } from "next/cache";

import { getAdminContext } from "@/lib/admin-context";

export type MenuActionResult<T = null> =
  { data: T } | { error: { code: string; fields?: Record<string, string> } };

/**
 * One wrapper for every menu action: validate, take the actor and venue from the session (never
 * from the client), call core (which checks the permission and writes the audit), refresh the
 * editor. Known refusals come back as codes; anything else is thrown for Sentry.
 */
// Structural, so the app needs no zod of its own: every schema here comes from @namitiszunk/validators.
type Schema<D> = {
  safeParse(input: unknown):
    | { success: true; data: D }
    | {
        success: false;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
};

async function run<D, T>(
  schema: Schema<D>,
  input: unknown,
  work: (
    data: D,
    context: Awaited<ReturnType<typeof getAdminContext>> & {
      venueId: string;
    },
  ) => Promise<T>,
): Promise<MenuActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.map(String).join("."),
        issue.message,
      ]),
    );
    return { error: { code: "validation_failed", fields } };
  }
  const context = await getAdminContext();
  if (!context.venue) return { error: { code: "forbidden" } };
  try {
    const data = await work(parsed.data, {
      ...context,
      venueId: context.venue.id,
    });
    revalidatePath("/menu");
    return { data };
  } catch (error) {
    if (error instanceof AppError)
      return { error: { code: error.code, fields: error.fields } };
    throw error;
  }
}

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
