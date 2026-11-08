import { submitReview } from "@namitiszunk/core/orders";
import { reviewInputSchema } from "@namitiszunk/validators";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";

// The guest rates a picked-up order once (T-045); a second rating answers 409.
export const POST = handler(
  {
    auth: guestCaller,
    // guestCaller proved the token; core checks the order is the guest's and picked up.
    permission: "none",
    input: reviewInputSchema,
    rateLimit: { limit: 5, windowSeconds: 60 },
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    await submitReview(actor, String(params.id), input);
    return { reviewed: true as const };
  },
);
