import { cancelGuestOrder, getGuestOrder } from "@namitiszunk/core/orders";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";

// The guest cancels before acceptance (T-043); the reject hook refunds the full amount (T-034).
// A repeat answers 409 from the state machine, so no Idempotency-Key is needed.
export const POST = handler(
  {
    auth: guestCaller,
    // transition() checks order.reject ("own") in the RBAC matrix.
    permission: "none",
    rateLimit: { limit: 10, windowSeconds: 60 },
    // Per guest token; a whole club behind one IP still fits (T-043 polls every 10 s while Ably is down).
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ actor, params }) => {
    const orderId = String(params.id);
    await cancelGuestOrder(actor, orderId);
    return getGuestOrder(actor, orderId);
  },
);
