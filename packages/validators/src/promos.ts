import { z } from "zod";

import { PROMO_CODE_PATTERN } from "./cart-limits";
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
  .regex(PROMO_CODE_PATTERN, { error: "validation.promoCode.invalid" });

// A new code needs 6 characters: there is no venue-wide guess limit, so its length is the defence
// against a guess from many addresses (docs/SECURITY.md). The checkout still takes any valid code.
const newPromoCodeSchema = promoCodeSchema.min(6, {
  error: "validation.promoCode.tooShort",
});

export const promoInputSchema = z
  .object({
    code: newPromoCodeSchema,
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

/** Admin: stop or restart a code (T-060). */
export const setPromoActiveInputSchema = z.object({
  id: objectIdSchema,
  isActive: z.boolean(),
});
