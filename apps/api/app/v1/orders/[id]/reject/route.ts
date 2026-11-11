import { rejectFromBar } from "@namitiszunk/core/bar-view";
import { barRejectInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// Staff rejects a New order (T-054); the reject hook refunds the full amount (T-034).
export const POST = handler(
  {
    auth: getSessionActor,
    // rejectFromBar checks order.reject (and product.setSoldOut for sold out) on the order's venue.
    permission: "none",
    input: barRejectInputSchema,
    rateLimit: { limit: 60, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    await rejectFromBar(actor, String(params.id), input);
    return { ok: true as const };
  },
);
