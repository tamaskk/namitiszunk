import { createGuestToken } from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import {
  type CreatedOrder,
  createOrder,
  reissueOrderPayment,
} from "@namitiszunk/core/payments";
import { createOrderInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { accountCaller } from "@/lib/account-caller";
import { inngest, orderCreatedEvent } from "@/src/inngest/client";

function created(order: CreatedOrder, guestToken: string): Response {
  return Response.json(
    {
      data: {
        orderId: order.orderId,
        clientSecret: order.clientSecret,
        guestToken,
      },
    },
    { status: 201 },
  );
}

// A guest creates an order awaiting payment and gets the PaymentIntent's client secret (T-033).
export const POST = handler(
  {
    auth: "public",
    permission: "none",
    input: createOrderInputSchema,
    rateLimit: { limit: 10, windowSeconds: 60 },
    // Only the order id is stored; a replay re-issues the guest token and the client secret while the
    // order awaits payment, and answers with the order id alone after that.
    idempotent: {
      toReplay: (body) => ({
        orderId: (body as { data: { orderId: string } }).data.orderId,
      }),
      fromReplay: async (stored, { input }) => {
        const guest = createGuestToken();
        const order = await reissueOrderPayment(
          (stored as { orderId: string }).orderId,
          guest.hash,
          input.posthogId,
        );
        if (!("clientSecret" in order))
          return { data: { orderId: order.orderId } };
        return {
          data: {
            orderId: order.orderId,
            clientSecret: order.clientSecret,
            guestToken: guest.token,
          },
        };
      },
    },
  },
  async ({ request, input }) => {
    // Without a key a double tap would make two orders and two charges.
    if (!request.headers.get("idempotency-key")) {
      throw new AppError(400, "validation_failed", {
        "Idempotency-Key": "required",
      });
    }
    const guest = createGuestToken();
    // Ordering never needs an account; a signed-in guest gets the order in their history (T-047).
    // Only an order-app session counts, and a failing lookup (2FA pending, auth down) never blocks payment.
    const account = await accountCaller(request).catch(() => null);
    const order = await createOrder(input, {
      guestTokenHash: guest.hash,
      ...(account ? { userId: account.userId } : {}),
      // Starts the 15-minute payment timeout (T-035).
      onOrderCreated: async ({ orderId, venueId }) => {
        await inngest.send(orderCreatedEvent(orderId, venueId));
      },
    });
    // The raw token leaves the server only here; the order keeps its hash.
    return created(order, guest.token);
  },
);
