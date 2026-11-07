import { z } from "zod";

import { hufSchema, objectIdSchema } from "./shared";

/** The venue whose Stripe connected account the Owner manages (T-032). */
export const stripeConnectInputSchema = z.object({ venueId: objectIdSchema });

export const connectAccountResponseSchema = z.object({
  stripeAccountId: z.string(),
});

export const accountLinkResponseSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

/** POST /v1/orders/{id}/refunds (T-034): whole forints, or "full" for everything not yet refunded. */
export const refundOrderInputSchema = z.object({
  amountHuf: z.union([
    z.literal("full"),
    hufSchema.min(1, { error: "validation.huf.min" }),
  ]),
  reason: z.string().trim().min(1).max(500),
});

export const refundResponseSchema = z.object({
  refundId: objectIdSchema,
  amountHuf: hufSchema,
  status: z.enum(["pending", "succeeded", "failed"]),
});

export type RefundOrderInput = z.infer<typeof refundOrderInputSchema>;
export type StripeConnectInput = z.infer<typeof stripeConnectInputSchema>;
