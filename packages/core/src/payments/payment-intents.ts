import "server-only";

import { type ClientSession, Order, Payment, Venue } from "@namitiszunk/db";
import { isValidObjectId } from "mongoose";
import type Stripe from "stripe";

import type { Actor } from "../auth/permissions";
import { InvalidTransition } from "../orders/state-machine";
import { transition } from "../orders/transition";
import { reportError } from "../report-error";
import { claimStripeEvent } from "./connect";
import { refundOrderInFull } from "./refund";

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

/**
 * No Payment for the intent. Only a crash between Stripe and Payment.create leaves one missing while
 * its order still awaits payment (the replay stores it): a 500 makes Stripe retry. Anything else
 * (unknown account or order) is not ours to settle and is acknowledged.
 */
async function assertNotARace(
  event: Stripe.PaymentIntentSucceededEvent,
): Promise<void> {
  const intent = event.data.object;
  const venue = event.account
    ? await Venue.findOne({ stripeAccountId: event.account })
        .select("_id")
        .lean()
    : null;
  const orderId = intent.metadata.orderId;
  const order =
    venue && isValidObjectId(orderId)
      ? await Order.findOne({ _id: orderId, venueId: venue._id })
          .select("status")
          .lean()
      : null;
  if (order?.status === "awaiting_payment") {
    throw new Error(`succeeded PaymentIntent ${intent.id} has no Payment yet`);
  }
}

/** Our Payment for the intent, after checking that Stripe charged what and where we asked. */
async function matchingPayment(
  event: Stripe.PaymentIntentSucceededEvent,
): Promise<{ id: unknown; orderId: string } | "mismatch" | "unknown"> {
  const intent = event.data.object;
  const payment = await Payment.findOne({ stripePaymentIntentId: intent.id })
    .select("venueId orderId amountHuf applicationFeeHuf")
    .lean();
  if (!payment) {
    await assertNotARace(event);
    return "unknown";
  }
  const venue = await Venue.findById(payment.venueId)
    .select("stripeAccountId")
    .lean();
  const matches =
    intent.amount === payment.amountHuf * 100 &&
    intent.application_fee_amount === payment.applicationFeeHuf * 100 &&
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
  if (typeof payment === "object") {
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
    if (payment === "unknown") {
      reportError(
        new Error(
          `PaymentIntent ${intent.id} succeeded with no Payment and no order awaiting it (account ${event.account ?? "none"}); check it in Stripe`,
        ),
      );
      return;
    }
    if (payment === "mismatch") {
      reportError(
        new Error(
          `PaymentIntent ${intent.id} does not match its Payment (amount, fee, currency or account); order left unpaid`,
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
  });
  // The guest paid for an order the timeout cancelled: never resurrected, refunded in full. After the
  // commit (the Payment must read succeeded) and on every delivery: refundOrderInFull is idempotent per order.
  if (late && typeof payment === "object") {
    await refundOrderInFull(payment.orderId, "late_payment");
  }
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
