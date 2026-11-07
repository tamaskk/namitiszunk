import { createHash } from "node:crypto";

import { assertMayRefund, refundOrder } from "@namitiszunk/core/payments";
import { refundOrderInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

const orderIdOf = (params: Record<string, unknown>) => String(params.id);

// A refund by a Manager, an Owner or HQ support (T-034). The Idempotency-Key replays the first answer
// (refund ids and amounts only), so a double click or a client retry starts one refund. The key also
// travels to the Refund (requestKey): a retry after a failure that released the key finds the same Refund.
export const POST = handler(
  {
    auth: getSessionActor,
    permission: ({ actor, input, params }) =>
      assertMayRefund(orderIdOf(params), actor, input.amountHuf),
    input: refundOrderInputSchema,
    rateLimit: { limit: 20, windowSeconds: 60 },
    idempotent: {
      toReplay: (body) => body,
      fromReplay: async (stored) => stored,
    },
  },
  ({ actor, input, params, request }) => {
    const key = request.headers.get("idempotency-key");
    return refundOrder(
      orderIdOf(params),
      input.amountHuf,
      input.reason,
      actor,
      key
        ? {
            requestKey: createHash("sha256")
              .update(`${actor.id}|${key}`)
              .digest("hex"),
          }
        : {},
    );
  },
);
