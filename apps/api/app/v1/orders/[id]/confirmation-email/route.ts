import { requestConfirmationEmail } from "@namitiszunk/core/orders";
import { sendEmail } from "@namitiszunk/emails";
import { confirmationEmailInputSchema } from "@namitiszunk/validators";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";
import { GUEST_TOKEN_HEADER } from "@/lib/realtime-caller";

// shortcut: the order app's production origin, as in src/inngest/deps.ts; a per-environment URL comes with T-014.
const ORDER_APP = "https://rendel.namitiszunk.hu";

// The guest e-mails their payment confirmation (T-044). Core caps it at 3 per order and answers 429 after.
export const POST = handler(
  {
    auth: guestCaller,
    // guestCaller proved the token; core checks the order is the guest's and paid.
    permission: "none",
    input: confirmationEmailInputSchema,
    rateLimit: { limit: 5, windowSeconds: 60 },
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ actor, input, params, request }) => {
    const orderId = String(params.id);
    const token = request.headers.get(GUEST_TOKEN_HEADER) ?? "";
    await requestConfirmationEmail(
      actor,
      orderId,
      {
        ...input,
        url: `${ORDER_APP}/${input.locale}/r/${orderId}?t=${encodeURIComponent(token)}`,
      },
      (email) => sendEmail(email.template, email.to, email.data),
    );
    return { sent: true as const };
  },
);
