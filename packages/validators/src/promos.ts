import { z } from "zod";

import {
  dateTimeSchema,
  discountTypes,
  hufSchema,
  objectIdSchema,
  percentAtMost100,
} from "./shared";

// Case-insensitive here; the Promo model stores it upper-case.
export const promoCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, { error: "validation.promoCode.invalid" });

export const promoInputSchema = z
  .object({
    code: promoCodeSchema,
    type: z.enum(discountTypes),
    // percent: basis points; fixed: forints.
    value: hufSchema,
    maxUses: z.int().min(1).optional(),
    minOrderHuf: hufSchema.optional(),
    validFrom: dateTimeSchema.optional(),
    validTo: dateTimeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(percentAtMost100, { path: ["value"], error: "validation.bps.max" })
  .refine(
    (promo) =>
      !promo.validFrom || !promo.validTo || promo.validFrom < promo.validTo,
    { path: ["validTo"], error: "validation.dateRange.invalid" },
  );

export const promoResponseSchema = z.object({
  id: objectIdSchema,
  code: z.string(),
  type: z.enum(discountTypes),
  value: hufSchema,
  maxUses: z.int().optional(),
  usedCount: z.int().min(0),
  minOrderHuf: hufSchema,
  validFrom: dateTimeSchema.optional(),
  validTo: dateTimeSchema.optional(),
  isActive: z.boolean(),
});

export type PromoInput = z.infer<typeof promoInputSchema>;
export type PromoResponse = z.infer<typeof promoResponseSchema>;
