import { z } from "zod";

import { MAX_QUANTITY_PER_LINE } from "./cart-limits";
import { hufSchema, huPhoneSchema, locales, objectIdSchema } from "./shared";
import { venueSlugSchema } from "./venues";

export { MAX_QUANTITY_PER_LINE };

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
// A sanity cap only; the venue's maxItemsPerOrder is checked on the server (spec 25, item 2).
const MAX_CART_LINES = 50;

export const cartLineSchema = z.object({
  itemId: objectIdSchema,
  quantity: z
    .int({ error: "validation.quantity.integer" })
    .min(1, { error: "validation.quantity.min" })
    .max(MAX_QUANTITY_PER_LINE, { error: "validation.quantity.max" }),
  modifierIds: z.array(objectIdSchema).max(20).optional(),
  // shortcut: guest item note hidden until T-047 stores it on OrderItem (needs NFC + control/bidi char filter)
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

/** GET /v1/orders/{id}: what the guest of the order sees (T-043, T-088). No token, phone or venue ids. */
export const orderResponseSchema = z.object({
  id: objectIdSchema,
  /** The short order number as shown, e.g. "#214". */
  number: z.string(),
  status: z.enum(orderStatuses),
  /** Order.updatedAt in epoch ms; a realtime message older than this is ignored. */
  version: z.int().min(0),
  items: z.array(
    z.object({
      name: z.string(),
      nameEn: z.string().optional(),
      quantity: z.int().min(1),
      lineTotalHuf: hufSchema,
    }),
  ),
  totalHuf: hufSchema,
  barName: z.string(),
  isVip: z.boolean(),
  /** Only before acceptance, which happens only at a manual-acceptance venue. */
  canCancel: z.boolean(),
  rejectionReason: z.string().optional(),
  refundedHuf: hufSchema,
});

// Same literals as packages/db; packages/core/src/validators-sync.test.ts keeps them equal.
export const problemCategories = [
  "not_received",
  "wrong_order",
  "payment",
  "other",
] as const;

/** POST /v1/orders/{id}/report: the guest reports a problem with a paid order (T-046). */
export const reportProblemInputSchema = z.object({
  category: z.enum(problemCategories, { error: "validation.required" }),
  message: z
    .string()
    .trim()
    .max(1000, { error: "validation.tooLong" })
    .optional(),
  email: z.email({ error: "validation.email.invalid" }).optional(),
});

export const reportProblemResponseSchema = z.object({
  reported: z.literal(true),
});

/** POST /v1/orders/{id}/confirmation-email: the guest sends the confirmation to an address (T-044). */
export const confirmationEmailInputSchema = z.object({
  email: z.email({ error: "validation.email.invalid" }),
  locale: z.enum(locales),
});

export const confirmationEmailResponseSchema = z.object({
  sent: z.literal(true),
});

export type CartLine = z.infer<typeof cartLineSchema>;
export type ValidateCartInput = z.infer<typeof validateCartInputSchema>;
export type TipChoiceInput = z.infer<typeof tipChoiceSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type OrderResponse = z.infer<typeof orderResponseSchema>;
export type ReportProblemInput = z.infer<typeof reportProblemInputSchema>;
export type ConfirmationEmailInput = z.infer<
  typeof confirmationEmailInputSchema
>;
