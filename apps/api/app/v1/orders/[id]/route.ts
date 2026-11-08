import { getGuestOrder } from "@namitiszunk/core/orders";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";

// The guest's order status (T-043, T-088). The page polls it every 10 s while Ably is down.
export const GET = handler(
  {
    auth: guestCaller,
    // guestCaller already proved the token belongs to this order; getGuestOrder checks it again.
    permission: "none",
    rateLimit: { limit: 60, windowSeconds: 60 },
    // Per guest token; a whole club behind one IP still fits (T-043 polls every 10 s while Ably is down).
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  ({ actor, params }) => getGuestOrder(actor, String(params.id)),
);
