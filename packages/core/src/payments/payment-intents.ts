import "server-only";

import { type ClientSession, Payment, Venue } from "@namitiszunk/db";
import type Stripe from "stripe";

import type { Actor } from "../auth/permissions";
import { InvalidTransition } from "../orders/state-machine";
import { transition } from "../orders/transition";
import { reportError } from "../report-error";
import { claimStripeEvent } from "./connect";

const systemStripe: Actor = { kind: "system", source: "stripe" };

async function inTransaction(
  work: (session: ClientSession) => Promise<void>,
): Promise<void> {
  const session = await Payment.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

/** Our Payment for the intent, after checking that Stripe charged what and where we asked. */
async function matchingPayment(
  event: Stripe.PaymentIntentSucceededEvent,
): Promise<{ id: unknown; orderId: string } | "mismatch"> {
  const intent = event.data.object;
  const payment = await Payment.findOne({ stripePaymentIntentId: intent.id })
    .select("venueId orderId amountHuf")
    .lean();
  // createOrder stores the Payment before the client secret leaves the server, so this is not a race:
  // a 500 makes Stripe retry and alerts us while it lasts.
  if (!payment) {
    throw new Error(`succeeded PaymentIntent ${intent.id} has no Payment`);
  }
  const venue = await Venue.findById(payment.venueId)
    .select("stripeAccountId")
    .lean();
  const matches =
    intent.amount === payment.amountHuf * 100 &&
    intent.currency === "huf" &&
    event.account !== undefined &&
    event.account === venue?.stripeAccountId;
  return matches
    ? { id: payment._id, orderId: String(payment.orderId) }
    : "mismatch";
}

/**
 * payment_intent.succeeded: the only way an order reaches New. The transition runs first and is
 * idempotent by itself (a repeat throws InvalidTransition), so a crash before the event is claimed
 * still leaves a retry that finishes the Payment; three deliveries give one transition.
 */
export async function handlePaymentSucceeded(
  event: Stripe.PaymentIntentSucceededEvent,
): Promise<void> {
  const intent = event.data.object;
  // Not created by createOrder (no order in the metadata): nothing of ours to settle.
  if (!intent.metadata?.orderId) return;
  const payment = await matchingPayment(event);

  let late = false;
  if (payment !== "mismatch") {
    try {
      await transition(payment.orderId, "payment_succeeded", systemStripe);
    } catch (error) {
      if (!(error instanceof InvalidTransition)) throw error;
      // Any other status means an earlier delivery already moved it on.
      late = error.from === "cancelled";
    }
  }

  await inTransaction(async (session) => {
    if (!(await claimStripeEvent(session, event))) return;
    if (payment === "mismatch") {
      reportError(
        new Error(
          `PaymentIntent ${intent.id} does not match its Payment (amount, currency or account); order left unpaid`,
        ),
      );
      return;
    }
    // The money arrived whatever the order did, so the Payment always records it.
    await Payment.updateOne(
      { _id: payment.id, status: "requires_payment" },
      { $set: { status: "succeeded" } },
      { session },
    );
    if (late) {
      // Never resurrected silently: the guest paid for an order the timeout cancelled; support refunds it (T-034).
      reportError(
        new Error(
          `PaymentIntent ${intent.id} succeeded after order ${payment.orderId} was cancelled; refund it`,
        ),
      );
    }
  });
  // shortcut: the receipt e-mail (intent.receipt_email / the charge's billing_details.email) has no field on Order or Payment yet, so it is not stored.
}

/** payment_intent.payment_failed: no status change; the guest may retry on the same PaymentIntent. */
export async function handlePaymentFailed(
  event: Stripe.PaymentIntentPaymentFailedEvent,
): Promise<void> {
  await inTransaction(async (session) => {
    await claimStripeEvent(session, event);
  });
}
