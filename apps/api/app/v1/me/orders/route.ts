import { listAccountOrders } from "@namitiszunk/core/account";

import { accountCaller } from "@/lib/account-caller";
import { handler } from "@/lib/handler";

// The signed-in guest's order history on /fiok (T-047).
export const GET = handler(
  {
    auth: accountCaller,
    // The caller reads their own orders only.
    permission: "none",
    rateLimit: { limit: 60, windowSeconds: 60 },
  },
  async ({ actor }) => listAccountOrders(actor),
);
