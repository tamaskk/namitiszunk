import { setReceiptEntered } from "@namitiszunk/core/bar-view";
import { receiptInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// The "receipt entered" mark (T-054, T-026), logged to the PIN holder.
export const POST = handler(
  {
    auth: getSessionActor,
    // setReceiptEntered checks order.markReceipt on the order's venue.
    permission: "none",
    input: receiptInputSchema,
    rateLimit: { limit: 240, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    await setReceiptEntered(actor, String(params.id), input.entered);
    return { ok: true as const };
  },
);
