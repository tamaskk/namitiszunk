import { moveOrderToBar } from "@namitiszunk/core/bar-view";
import { moveOrderInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// Moves a waiting order to another bar of the venue (T-054); both bars and the guest page reload.
export const POST = handler(
  {
    auth: getSessionActor,
    // moveOrderToBar checks order.moveBar on the order's venue, and the target bar's venue.
    permission: "none",
    input: moveOrderInputSchema,
    rateLimit: { limit: 60, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    await moveOrderToBar(actor, String(params.id), input.barId);
    return { ok: true as const };
  },
);
