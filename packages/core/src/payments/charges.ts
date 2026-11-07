import "server-only";

import { Payment, Venue } from "@namitiszunk/db";

import type { StripeCharge } from "../jobs/reconcile";
import { stripe } from "./stripe-client";

/** Stripe counts HUF in hundredths; our charges are whole forints (pricing sends totalHuf * 100). */
const toHuf = (amount: number) => Math.round(amount / 100);

/**
 * Succeeded charges in [from, to) on every venue's connected account (direct charges),
 * for the daily reconciliation (T-035).
 */
export async function listSucceededCharges(range: {
  from: Date;
  to: Date;
}): Promise<StripeCharge[]> {
  const venues = await Venue.find({ stripeAccountId: { $type: "string" } })
    .select("stripeAccountId")
    .lean();
  const charges: StripeCharge[] = [];
  for (const venue of venues) {
    const list = stripe().charges.list(
      {
        created: {
          gte: Math.floor(range.from.getTime() / 1000),
          lt: Math.floor(range.to.getTime() / 1000),
        },
        limit: 100,
      },
      { stripeAccount: venue.stripeAccountId! },
    );
    for await (const charge of list) {
      if (charge.status !== "succeeded" || !charge.payment_intent) continue;
      charges.push({
        paymentIntentId:
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent.id,
        amountHuf: toHuf(charge.amount),
        refundedHuf: toHuf(charge.amount_refunded),
      });
    }
  }
  return charges;
}

/**
 * Payment timeout (T-035): cancels every open PaymentIntent of the order on the venue's connected account.
 * Throws when Stripe already took the money, so the caller keeps the order and the webhook marks it paid.
 */
export async function cancelOrderPaymentIntents(
  orderId: string,
): Promise<void> {
  const payments = await Payment.find({ orderId, status: "requires_payment" })
    .select("venueId stripePaymentIntentId")
    .lean();
  for (const payment of payments) {
    const venue = await Venue.findById(payment.venueId)
      .select("stripeAccountId")
      .lean();
    if (!venue?.stripeAccountId) continue;
    const options = { stripeAccount: venue.stripeAccountId };
    const intent = await stripe().paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      {},
      options,
    );
    if (intent.status === "canceled") continue;
    if (intent.status === "succeeded" || intent.status === "processing") {
      throw new Error(
        `PaymentIntent ${intent.id} is ${intent.status}; the order is not cancelled`,
      );
    }
    await stripe().paymentIntents.cancel(
      intent.id,
      { cancellation_reason: "abandoned" },
      options,
    );
  }
}
