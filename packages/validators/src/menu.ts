import { z } from "zod";

import { blobUrlSchema, hufSchema, nameSchema, objectIdSchema } from "./shared";

// Same literals as packages/db; packages/core/src/validators-sync.test.ts keeps them equal.
export const vatRates = [5, 18, 27] as const;

const optionalText = z.string().max(1000).optional();

export const categoryInputSchema = z.object({
  name: nameSchema,
  nameEn: nameSchema.optional(),
  sortOrder: z.int().optional(),
});

const modifierInputSchema = z.object({
  name: nameSchema,
  nameEn: nameSchema.optional(),
  priceDeltaHuf: hufSchema,
});

const modifierGroupInputSchema = z
  .object({
    name: nameSchema,
    nameEn: nameSchema.optional(),
    required: z.boolean(),
    minSelect: z.int().min(0),
    maxSelect: z.int().min(1),
    modifiers: z.array(modifierInputSchema).min(1),
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
  priceHuf: hufSchema,
  vatRate: z.literal(vatRates, { error: "validation.vatRate.invalid" }),
  imageUrl: blobUrlSchema.optional(),
  alcoholPercent: z.number().min(0).max(100).optional(),
  allergens: z.array(z.string().max(50)).optional(),
  isAvailable: z.boolean().optional(),
  vipOnly: z.boolean().optional(),
  barIds: z.array(objectIdSchema).optional(),
  modifierGroups: z.array(modifierGroupInputSchema).optional(),
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
