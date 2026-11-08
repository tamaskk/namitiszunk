import { reorder } from "@namitiszunk/core/account";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";

// "Rendeld újra" on the thanks page (T-045): the order's lines as a cart at today's prices.
export const POST = handler(
  {
    auth: guestCaller,
    // guestCaller proved the token; core checks it again.
    permission: "none",
    rateLimit: { limit: 20, windowSeconds: 60 },
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ actor, params }) => reorder(actor, String(params.id)),
);
