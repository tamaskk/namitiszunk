import { hashGuestToken } from "@namitiszunk/auth";
import { claimDeviceOrders } from "@namitiszunk/core/account";
import { claimOrdersInputSchema } from "@namitiszunk/validators";

import { accountCaller } from "@/lib/account-caller";
import { handler } from "@/lib/handler";

// After sign-in the device hands over the orders it remembers (T-047); each needs its own token.
export const POST = handler(
  {
    auth: accountCaller,
    // Ownership is the order's token, checked by hash in core.
    permission: "none",
    input: claimOrdersInputSchema,
    rateLimit: { limit: 10, windowSeconds: 60 },
  },
  async ({ actor, input }) =>
    claimDeviceOrders(
      actor,
      input.orders.map((o) => ({
        orderId: o.orderId,
        tokenHash: hashGuestToken(o.token),
      })),
    ),
);
