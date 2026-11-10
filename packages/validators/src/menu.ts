import { z } from "zod";

import { blobUrlSchema, hufSchema, nameSchema, objectIdSchema } from "./shared";

// Same literals as packages/db; packages/core/src/validators-sync.test.ts keeps them equal.
export const vatRates = [5, 18, 27] as const;
export const allergenCodes = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

const optionalText = z.string().max(1000).optional();

export const categoryInputSchema = z.object({
  name: nameSchema,
  nameEn: nameSchema.optional(),
  sortOrder: z.int().optional(),
  vipOnly: z.boolean().optional(),
});

// A menu price above a million forints is a typo (an extra zero), not a drink.
const menuHufSchema = hufSchema.max(1_000_000, {
  error: "validation.huf.max",
});

const modifierInputSchema = z.object({
  name: nameSchema,
  nameEn: nameSchema.optional(),
  priceDeltaHuf: menuHufSchema,
});

const modifierGroupInputSchema = z
  .object({
    name: nameSchema,
    nameEn: nameSchema.optional(),
    required: z.boolean(),
    minSelect: z.int().min(0),
    maxSelect: z.int().min(1),
    modifiers: z.array(modifierInputSchema).min(1).max(50),
  })
  .refine((group) => group.minSelect <= group.maxSelect, {
    path: ["minSelect"],
    error: "validation.modifierGroup.minAboveMax",
  });

export const itemInputSchema = z.object({
  categoryId: objectIdSchema,
  name: nameSchema,
  nameEn: nameSchema.optional(),
  description: optionalText,
  descriptionEn: optionalText,
  priceHuf: menuHufSchema,
  vatRate: z.literal(vatRates, { error: "validation.vatRate.invalid" }),
  imageUrl: blobUrlSchema.optional(),
  alcoholPercent: z
    .number({ error: "validation.invalid" })
    .min(0, { error: "validation.invalid" })
    .max(100, { error: "validation.invalid" })
    .optional(),
  allergens: z
    .array(z.enum(allergenCodes))
    .max(allergenCodes.length)
    .optional(),
  isAvailable: z.boolean().optional(),
  barIds: z.array(objectIdSchema).optional(),
  modifierGroups: z.array(modifierGroupInputSchema).max(20).optional(),
});

/** Admin menu actions (T-051): one venue's category or item order, top to bottom. */
export const reorderInputSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
});
export const menuIdInputSchema = z.object({ id: objectIdSchema });
export const setAvailableInputSchema = z.object({
  id: objectIdSchema,
  available: z.boolean(),
});
export const updateCategoryInputSchema = z.object({
  id: objectIdSchema,
  input: categoryInputSchema,
});
export const updateItemInputSchema = z.object({
  id: objectIdSchema,
  input: itemInputSchema,
});
export const reorderItemsInputSchema = reorderInputSchema.extend({
  categoryId: objectIdSchema,
});
/** The menu CSV import (T-052): the file's text, decoded as UTF-8 in the browser. */
export const MENU_IMPORT_MAX_CHARS = 200_000;
export const menuImportInputSchema = z.object({
  csv: z.string().min(1).max(MENU_IMPORT_MAX_CHARS),
});

export const categoryResponseSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  nameEn: z.string().optional(),
  sortOrder: z.int(),
});

export const itemResponseSchema = z.object({
  id: objectIdSchema,
  categoryId: objectIdSchema,
  name: z.string(),
  nameEn: z.string().optional(),
  description: z.string().optional(),
  descriptionEn: z.string().optional(),
  priceHuf: hufSchema,
  vatRate: z.literal(vatRates),
  imageUrl: z.string().optional(),
  alcoholPercent: z.number().optional(),
  allergens: z.array(z.string()),
  isAvailable: z.boolean(),
  vipOnly: z.boolean(),
  modifierGroups: z.array(
    z.object({
      id: objectIdSchema,
      name: z.string(),
      nameEn: z.string().optional(),
      required: z.boolean(),
      minSelect: z.int(),
      maxSelect: z.int(),
      modifiers: z.array(
        z.object({
          id: objectIdSchema,
          name: z.string(),
          nameEn: z.string().optional(),
          priceDeltaHuf: hufSchema,
        }),
      ),
    }),
  ),
});

export const menuResponseSchema = z.object({
  categories: z.array(categoryResponseSchema),
  items: z.array(itemResponseSchema),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type MenuResponse = z.infer<typeof menuResponseSchema>;
