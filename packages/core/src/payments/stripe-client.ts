import "server-only";

import Stripe from "stripe";

let client: Stripe | undefined;

/** The one Stripe client of the platform account; connected-account calls pass `stripeAccount` per request. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
    client = new Stripe(key, { maxNetworkRetries: 2 });
  }
  return client;
}
