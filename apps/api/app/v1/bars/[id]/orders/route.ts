import { getBarView } from "@namitiszunk/core/bar-view";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// The bar view's list (T-054): loaded on open, on every reconnect and on every bar message.
export const GET = handler(
  {
    auth: getSessionActor,
    // getBarView checks order.start on the bar's venue.
    permission: "none",
    rateLimit: { limit: 240, windowSeconds: 60 },
  },
  ({ actor, params }) => getBarView(actor, String(params.id)),
);
