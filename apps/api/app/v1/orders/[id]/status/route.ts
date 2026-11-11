import { transition } from "@namitiszunk/core/orders";
import { barOrderEventInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// One tap on a bar view card (T-054): Start, Ready or Picked up. A double tap answers 409 from the
// state machine, so no Idempotency-Key is needed.
export const POST = handler(
  {
    auth: getSessionActor,
    // transition() checks order.<event> (and order.handOverVip for a VIP pickup) on the order's venue.
    permission: "none",
    input: barOrderEventInputSchema,
    rateLimit: { limit: 240, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    await transition(String(params.id), input.event, actor);
    return { ok: true as const };
  },
);
