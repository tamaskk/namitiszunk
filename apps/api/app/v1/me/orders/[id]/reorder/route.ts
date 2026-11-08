import { reorder } from "@namitiszunk/core/account";

import { accountCaller } from "@/lib/account-caller";
import { handler } from "@/lib/handler";

// "Rendeld újra" from the order history (T-047).
export const POST = handler(
  {
    auth: accountCaller,
    // Core answers 404 unless the order belongs to the caller's account.
    permission: "none",
    rateLimit: { limit: 20, windowSeconds: 60 },
  },
  async ({ actor, params }) => reorder(actor, String(params.id)),
);
