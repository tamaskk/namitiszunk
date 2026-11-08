import { quoteOrder } from "@namitiszunk/core/payments";
import { quoteOrderInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";

// The checkout summary (T-042): priced by the server as POST /v1/orders will price it; stores nothing.
export const POST = handler(
  {
    auth: "public",
    permission: "none",
    input: quoteOrderInputSchema,
    // Every tip or SMS change asks again; the checkout debounces, this only stops abuse.
    rateLimit: { limit: 60, windowSeconds: 60 },
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ input }) => quoteOrder(input),
);
