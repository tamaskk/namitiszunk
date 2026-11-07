import { z } from "zod";

import { objectIdSchema } from "./shared";

/** The venue whose Stripe connected account the Owner manages (T-032). */
export const stripeConnectInputSchema = z.object({ venueId: objectIdSchema });

export const connectAccountResponseSchema = z.object({
  stripeAccountId: z.string(),
});

export const accountLinkResponseSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export type StripeConnectInput = z.infer<typeof stripeConnectInputSchema>;
