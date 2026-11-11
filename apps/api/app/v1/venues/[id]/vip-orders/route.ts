import { getVipView } from "@namitiszunk/core/bar-view";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// The VIP host's list (T-055): loaded on open, on every reconnect and on every VIP channel message.
export const GET = handler(
  {
    auth: getSessionActor,
    // getVipView checks order.viewTakeOutList on the venue.
    permission: "none",
    rateLimit: { limit: 240, windowSeconds: 60 },
  },
  ({ actor, params }) => getVipView(actor, String(params.id)),
);
