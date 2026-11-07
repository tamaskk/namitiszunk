import { createGuestToken } from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import {
  type CreatedOrder,
  createOrder,
  reissueOrderPayment,
} from "@namitiszunk/core/payments";
import { createOrderInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
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
    // Only the order id is stored; a replay re-issues the guest token and the client secret.
    idempotent: {
      toReplay: (body) => ({
        orderId: (body as { data: { orderId: string } }).data.orderId,
      }),
      fromReplay: async (stored) => {
        const guest = createGuestToken();
        const order = await reissueOrderPayment(
          (stored as { orderId: string }).orderId,
          guest.hash,
        );
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
    const order = await createOrder(input, {
      guestTokenHash: guest.hash,
      // Starts the 15-minute payment timeout (T-035).
      onOrderCreated: async ({ orderId, venueId }) => {
        await inngest.send(orderCreatedEvent(orderId, venueId));
      },
    });
    // The raw token leaves the server only here; the order keeps its hash.
    return created(order, guest.token);
  },
);
