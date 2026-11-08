import { z } from "zod";

import {
  dateTimeSchema,
  hufSchema,
  huPhoneSchema,
  objectIdSchema,
} from "./shared";
import { venueSlugSchema } from "./venues";

// Same literals as packages/db and packages/core; packages/core/src/validators-sync.test.ts keeps them equal.
export const orderStatuses = [
  "awaiting_payment",
  "new",
  "preparing",
  "ready",
  "picked_up",
  "cancelled",
  "rejected",
  "expired",
  "refunded",
] as const;
export const TIP_PERCENT_BPS = [0, 500, 1000, 1500] as const;
export const MAX_QUANTITY_PER_LINE = 10;
// A sanity cap only; the venue's maxItemsPerOrder is checked on the server (spec 25, item 2).
const MAX_CART_LINES = 50;
export const CART_NOTE_MAX = 100;

export const cartLineSchema = z.object({
  itemId: objectIdSchema,
  quantity: z
    .int({ error: "validation.quantity.integer" })
    .min(1, { error: "validation.quantity.min" })
    .max(MAX_QUANTITY_PER_LINE, { error: "validation.quantity.max" }),
  modifierIds: z.array(objectIdSchema).max(20).optional(),
  /** For the bar, shown on the order card (T-041). */
  note: z
    .string()
    .trim()
    .max(CART_NOTE_MAX, { error: "validation.note.max" })
    .optional(),
});

/** "Tovább" in the cart (T-041): the guest's lines with the unit price they were shown. */
export const validateCartInputSchema = z.object({
  slug: venueSlugSchema,
  barId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  items: z
    .array(
      cartLineSchema.extend({
        /** Base price plus surcharges as the cart showed it; compared, never charged. */
        unitPriceHuf: hufSchema,
      }),
    )
    .min(1, { error: "validation.cart.empty" })
    .max(MAX_CART_LINES, { error: "validation.cart.max" }),
});

export const tipChoiceSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("percent"),
      bps: z.literal(TIP_PERCENT_BPS, { error: "validation.tip.preset" }),
    }),
    z.object({ type: z.literal("custom"), amountHuf: hufSchema }),
  ],
  { error: "validation.tip.invalid" },
);

/** Prices, totals and the venue come from the server; the cart only names items and quantities. */
export const createOrderInputSchema = z
  .object({
    barId: objectIdSchema,
    zoneId: objectIdSchema.optional(),
    items: z
      .array(cartLineSchema)
      .min(1, { error: "validation.cart.empty" })
      .max(MAX_CART_LINES, { error: "validation.cart.max" }),
    tip: tipChoiceSchema,
    promoCode: z.string().max(32).optional(),
    guestPhone: huPhoneSchema.optional(),
    smsRequested: z.boolean(),
    acceptedTermsVersion: z
      .string()
      .min(1, { error: "validation.terms.required" })
      .max(32),
    /** PostHog distinct id, copied into the PaymentIntent metadata. */
    posthogId: z.string().max(200).optional(),
  })
  .refine((order) => !order.smsRequested || order.guestPhone !== undefined, {
    path: ["guestPhone"],
    error: "validation.phone.requiredForSms",
  });

export const createOrderResponseSchema = z.object({
  orderId: objectIdSchema,
  /** Null when nothing is charged (a fully discounted order). Absent on a replay once the order left awaiting payment. */
  clientSecret: z.string().nullable().optional(),
  /** Absent on a replay once the order left awaiting payment: the first answer's token stays the only one. */
  guestToken: z.string().optional(),
});

export const orderItemResponseSchema = z.object({
  itemId: objectIdSchema,
  name: z.string(),
  nameEn: z.string().optional(),
  unitPriceHuf: hufSchema,
  quantity: z.int().min(1),
  options: z.array(
    z.object({
      groupName: z.string(),
      name: z.string(),
      priceDeltaHuf: hufSchema,
    }),
  ),
  lineTotalHuf: hufSchema,
  status: z.enum(["ok", "rejected"]),
});

export const orderResponseSchema = z.object({
  id: objectIdSchema,
  venueId: objectIdSchema,
  barId: objectIdSchema,
  shortNumber: z.int().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(orderStatuses),
  items: z.array(orderItemResponseSchema),
  subtotalHuf: hufSchema,
  serviceFeeHuf: hufSchema,
  tipHuf: hufSchema,
  discountHuf: hufSchema,
  totalHuf: hufSchema,
  pickupCode: z.string(),
  smsRequested: z.boolean(),
  isVip: z.boolean(),
  rejectionReason: z.string().optional(),
  createdAt: dateTimeSchema,
  paidAt: dateTimeSchema.optional(),
  readyAt: dateTimeSchema.optional(),
  pickedUpAt: dateTimeSchema.optional(),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type ValidateCartInput = z.infer<typeof validateCartInputSchema>;
export type TipChoiceInput = z.infer<typeof tipChoiceSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;
