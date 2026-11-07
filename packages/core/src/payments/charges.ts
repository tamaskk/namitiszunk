import "server-only";

import { Venue } from "@namitiszunk/db";

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
