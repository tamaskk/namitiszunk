import { requirePermission } from "@namitiszunk/core/auth";
import { createConnectAccount } from "@namitiszunk/core/payments";
import { stripeConnectInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { sessionActor } from "@/lib/session-actor";

// The Owner creates the venue's Stripe Express account (T-032).
export const POST = handler(
  {
    auth: sessionActor,
    permission: ({ actor, input }) =>
      requirePermission(actor, "payout.manage", { venueId: input.venueId }),
    input: stripeConnectInputSchema,
    rateLimit: { limit: 10, windowSeconds: 60 },
  },
  ({ actor, input }) => createConnectAccount(input.venueId, actor),
);
