import "server-only";

import {
  type ClientSession,
  Order,
  Payment,
  Refund,
  type RefundDoc,
  Venue,
} from "@namitiszunk/db";
import { isValidObjectId, type Types } from "mongoose";
import type Stripe from "stripe";

import { audit, auditActorOf } from "../audit/audit";
import {
  type Actor,
  requirePermission,
  type Resource,
} from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { InvalidTransition } from "../orders/state-machine";
import { transition } from "../orders/transition";
import { reportError } from "../report-error";
import { claimStripeEvent } from "./connect";
import { stripe } from "./stripe-client";

export type RefundAmount = number | "full";

export type RefundResult = {
  refundId: string;
  amountHuf: number;
  status: "pending" | "succeeded" | "failed";
};

type SentRefund = Pick<
  RefundDoc,
  "venueId" | "paymentId" | "orderId" | "amountHuf"
> & { _id: Types.ObjectId };

const systemInngest: Actor = { kind: "system", source: "inngest" };
const systemStripe: Actor = { kind: "system", source: "stripe" };

// The pilot has no limit and the Venue has no limit field yet; null is "no limit" (undefined would deny a manager).
const MANAGER_REFUND_LIMIT_HUF: number | null = null;

const refundResource = (venueId: string, amountHuf?: number): Resource => ({
  venueId,
  amountHuf,
  managerRefundLimitHuf: MANAGER_REFUND_LIMIT_HUF,
});

async function inTransaction(
  work: (session: ClientSession) => Promise<void>,
): Promise<void> {
  const session = await Refund.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

type Initiator = {
  type: "venue_member" | "platform_member" | "system";
  id?: string;
};

function initiatedBy(actor: Actor, venueId: string): Initiator {
  if (actor.kind === "staff")
    return { type: "venue_member", id: actor.memberId };
  if (actor.kind === "user") {
    const member = actor.memberships.find((m) => m.venueId === venueId);
    return member
      ? { type: "venue_member", id: member.memberId }
      : { type: "platform_member", id: actor.userId };
  }
  return { type: "system" };
}

/** Entry-point check for the API route; refundOrder checks again with the exact amount. */
export async function assertMayRefund(
  orderId: string,
  actor: Actor,
  amount: RefundAmount,
): Promise<void> {
  if (!isValidObjectId(orderId)) throw new NotFoundError();
  const order = await Order.findById(orderId).select("venueId").lean();
  if (!order) throw new NotFoundError();
  requirePermission(
    actor,
    "order.refund",
    refundResource(
      String(order.venueId),
      amount === "full" ? undefined : amount,
    ),
  );
}

/**
 * Sends a committed Refund to Stripe on the venue's connected account. The Refund id is the
 * idempotency key, so sending the same Refund again never makes a second Stripe refund.
 * A Stripe error marks it failed and is reported: never a silent loss.
 */
async function sendToStripe(refund: SentRefund): Promise<RefundResult> {
  const [payment, venue] = await Promise.all([
    Payment.findById(refund.paymentId).select("stripePaymentIntentId").lean(),
    Venue.findById(refund.venueId).select("stripeAccountId").lean(),
  ]);
  const refundId = String(refund._id);
  let created: Stripe.Refund;
  try {
    if (!payment || !venue?.stripeAccountId) {
      throw new Error(
        `refund ${refundId}: payment or connected account missing`,
      );
    }
    created = await stripe().refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: refund.amountHuf * 100,
        // The platform fee always goes back; Stripe returns it in proportion on a partial refund.
        refund_application_fee: true,
        metadata: { refundId },
      },
      { stripeAccount: venue.stripeAccountId, idempotencyKey: refundId },
    );
  } catch (error) {
    // shortcut: a timeout after Stripe accepted also lands here; the webhook (metadata.refundId) then marks it succeeded.
    await markFailed(refund);
    reportError(error);
    throw new ConflictError("refund_failed");
  }
  await Refund.updateOne(
    { _id: refund._id },
    { $set: { stripeRefundId: created.id } },
  );
  // The final status comes from the webhook (charge.refunded, refund.updated).
  return { refundId, amountHuf: refund.amountHuf, status: "pending" };
}

async function markFailed(refund: SentRefund): Promise<void> {
  await inTransaction(async (session) => {
    const res = await Refund.updateOne(
      { _id: refund._id, status: "pending" },
      { $set: { status: "failed" } },
      { session },
    );
    if (res.modifiedCount === 0) return;
    await audit(session, {
      actor: auditActorOf(systemStripe),
      venueId: refund.venueId,
      action: "refund.failed",
      target: { type: "refund", id: refund._id },
      before: { status: "pending" },
      after: { status: "failed" },
    });
  });
}

/**
 * Refunds a paid order in full or in part (docs/fejlesztesi-terv.md #34). The amount may not exceed
 * the part not yet refunded (succeeded and pending refunds count): 409 otherwise.
 * The Refund and its audit entry commit first; Stripe is called after the commit.
 */
export async function refundOrder(
  orderId: string,
  amount: RefundAmount,
  reason: string,
  actor: Actor,
): Promise<RefundResult> {
  if (amount !== "full" && !(Number.isInteger(amount) && amount > 0)) {
    throw new AppError(400, "validation_failed", {
      amountHuf: "validation.huf.min",
    });
  }
  const why = reason.trim();
  if (!why) throw new AppError(400, "reason_required");
  if (!isValidObjectId(orderId)) throw new NotFoundError();

  let created: (SentRefund & { remainingAfter: number }) | undefined;
  await inTransaction(async (session) => {
    created = undefined;
    const order = await Order.findById(orderId)
      .select("venueId")
      .session(session)
      .lean();
    if (!order) throw new NotFoundError();
    const venueId = String(order.venueId);
    // Role check first, so a caller without the permission learns nothing about the payment.
    requirePermission(
      actor,
      "order.refund",
      refundResource(venueId, amount === "full" ? undefined : amount),
    );

    const payment = await Payment.findOne({
      orderId: order._id,
      status: { $in: ["succeeded", "partially_refunded", "refunded"] },
    })
      .select("amountHuf")
      .session(session)
      .lean();
    if (!payment) throw new ConflictError("order_not_paid");
    // Writing the Payment makes two concurrent refunds conflict; the retried one sees the other's Refund.
    await Payment.updateOne(
      { _id: payment._id },
      { $currentDate: { updatedAt: true } },
      { session, timestamps: false },
    );
    const open = await Refund.find({
      paymentId: payment._id,
      status: { $in: ["pending", "succeeded"] },
    })
      .select("amountHuf")
      .session(session)
      .lean();
    const remaining =
      payment.amountHuf - open.reduce((sum, r) => sum + r.amountHuf, 0);
    const amountHuf = amount === "full" ? remaining : amount;
    // The limit check needs the resolved amount of a full refund too.
    requirePermission(
      actor,
      "order.refund",
      refundResource(venueId, amountHuf),
    );
    if (amountHuf <= 0 || amountHuf > remaining) {
      throw new ConflictError("refund_exceeds_remaining");
    }

    const by = initiatedBy(actor, venueId);
    const [refund] = await Refund.create(
      [
        {
          venueId: order.venueId,
          paymentId: payment._id,
          orderId: order._id,
          amountHuf,
          reason: why,
          initiatedBy: by,
        },
      ],
      { session },
    );
    await audit(session, {
      actor: auditActorOf(actor),
      ...(by.type === "platform_member" &&
        by.id && { impersonatedBy: { id: by.id } }),
      venueId: order.venueId,
      action: "refund.created",
      target: { type: "refund", id: refund!._id },
      after: { orderId, paymentId: payment._id, amountHuf, reason: why },
    });
    created = { ...refund!.toObject(), remainingAfter: remaining - amountHuf };
  });
  if (!created) throw new Error("transaction finished without a refund");

  const result = await sendToStripe(created);
  // Nothing left to refund: the order becomes Refunded where the state machine allows it for this actor
  // (staff from Picked up or Expired). Rejection keeps Rejected; the expiry job transitions itself.
  if (created.remainingAfter === 0 && actor.kind !== "system") {
    await transition(orderId, "refund", actor, {
      reason: why,
      resource: refundResource(String(created.venueId), created.amountHuf),
    }).catch((error: unknown) => {
      // The refund went through either way; a failed status change must not hide that.
      if (!(error instanceof InvalidTransition)) reportError(error);
    });
  }
  return result;
}

/**
 * Rejection and expiry (Inngest): refunds whatever is left, idempotent per order, so a retry never
 * refunds twice. A Refund committed but never sent (crash before the Stripe call) is resent first.
 */
export async function refundOrderInFull(
  orderId: string,
  reason: "rejected" | "expired",
): Promise<void> {
  const unsent = await Refund.find({
    orderId,
    status: "pending",
    stripeRefundId: { $exists: false },
  }).lean();
  for (const refund of unsent) await sendToStripe(refund);
  try {
    await refundOrder(orderId, "full", reason, systemInngest);
  } catch (error) {
    if (
      error instanceof ConflictError &&
      error.code === "refund_exceeds_remaining"
    )
      return;
    throw error;
  }
}

const refundStatusOf = (
  status: Stripe.Refund["status"],
): "succeeded" | "failed" | null =>
  status === "succeeded"
    ? "succeeded"
    : status === "failed" || status === "canceled"
      ? "failed"
      : null;

/**
 * The Stripe refund is the one we sent for this Refund: same connected account as the venue,
 * same PaymentIntent and amount, and no other Stripe refund already recorded on it.
 */
async function belongsTo(
  refund: Pick<
    RefundDoc,
    "venueId" | "paymentId" | "amountHuf" | "stripeRefundId"
  >,
  stripeRefund: Stripe.Refund,
  account: string | undefined,
  session: ClientSession,
): Promise<boolean> {
  if (refund.stripeRefundId && refund.stripeRefundId !== stripeRefund.id)
    return false;
  if (stripeRefund.amount !== refund.amountHuf * 100) return false;
  // Sequential: operations in one transaction session must not run in parallel.
  const venue = await Venue.findById(refund.venueId)
    .select("stripeAccountId")
    .session(session)
    .lean();
  const payment = await Payment.findById(refund.paymentId)
    .select("stripePaymentIntentId")
    .session(session)
    .lean();
  const intent =
    typeof stripeRefund.payment_intent === "string"
      ? stripeRefund.payment_intent
      : stripeRefund.payment_intent?.id;
  return (
    !!account &&
    venue?.stripeAccountId === account &&
    !!payment &&
    intent === payment.stripePaymentIntentId
  );
}

export type RefundEvent =
  | Stripe.ChargeRefundedEvent
  | Stripe.ChargeRefundUpdatedEvent
  | Stripe.RefundUpdatedEvent
  | Stripe.RefundFailedEvent;

export const refundEventTypes: ReadonlySet<string> = new Set<
  RefundEvent["type"]
>([
  "charge.refunded",
  "charge.refund.updated",
  "refund.updated",
  "refund.failed",
]);

/**
 * Refund webhooks from the connected accounts: Refund succeeded or failed, the Payment's refund
 * status, and on a full refund the order's `refund` transition where the state machine lets the
 * Stripe system actor make it. Only Refunds we created (metadata.refundId) are touched.
 */
export async function handleRefundEvent(event: RefundEvent): Promise<void> {
  let stripeRefunds: Stripe.Refund[];
  if (event.type === "charge.refunded") {
    // The Charge does not carry its refunds; list them on the connected account.
    const list = await stripe().refunds.list(
      { charge: event.data.object.id, limit: 100 },
      event.account ? { stripeAccount: event.account } : undefined,
    );
    stripeRefunds = list.data;
  } else {
    stripeRefunds = [event.data.object];
  }

  let failed: SentRefund[] = [];
  let fullyRefunded: string[] = [];
  let mismatched: string[] = [];
  await inTransaction(async (session) => {
    failed = [];
    fullyRefunded = [];
    mismatched = [];
    if (!(await claimStripeEvent(session, event))) return;
    const paymentIds = new Set<string>();
    for (const stripeRefund of stripeRefunds) {
      const status = refundStatusOf(stripeRefund.status);
      const refundId = stripeRefund.metadata?.refundId;
      if (!status || !refundId || !isValidObjectId(refundId)) continue;
      const refund = await Refund.findById(refundId).session(session).lean();
      if (!refund) continue;
      // Every connected account posts to this one endpoint: metadata alone is not proof the refund is ours.
      if (!(await belongsTo(refund, stripeRefund, event.account, session))) {
        mismatched.push(`${stripeRefund.id} -> refund ${refundId}`);
        continue;
      }
      if (refund.status === status) continue;
      await Refund.updateOne(
        { _id: refund._id },
        { $set: { status, stripeRefundId: stripeRefund.id } },
        { session },
      );
      await audit(session, {
        actor: auditActorOf(systemStripe),
        venueId: refund.venueId,
        action: `refund.${status}`,
        target: { type: "refund", id: refund._id },
        before: { status: refund.status },
        after: { status },
      });
      if (status === "failed") failed.push(refund);
      paymentIds.add(String(refund.paymentId));
    }

    for (const paymentId of paymentIds) {
      const payment = await Payment.findById(paymentId)
        .select("orderId amountHuf status")
        .session(session)
        .lean();
      if (!payment) continue;
      const done = await Refund.find({ paymentId, status: "succeeded" })
        .select("amountHuf")
        .session(session)
        .lean();
      const refundedHuf = done.reduce((sum, r) => sum + r.amountHuf, 0);
      const status =
        refundedHuf >= payment.amountHuf
          ? "refunded"
          : refundedHuf > 0
            ? "partially_refunded"
            : "succeeded";
      if (status === "refunded") fullyRefunded.push(String(payment.orderId));
      if (status === payment.status) continue;
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status } },
        { session },
      );
    }
  });

  for (const pair of mismatched) {
    reportError(
      new Error(
        `Stripe refund event ${event.id} does not match its Refund: ${pair}`,
      ),
    );
  }
  // After the commit: the admin sees the failed Refund; Sentry alerts.
  for (const refund of failed) {
    reportError(
      new Error(
        `Stripe refund ${String(refund._id)} of order ${String(refund.orderId)} failed`,
      ),
    );
  }
  for (const orderId of fullyRefunded) {
    await transition(orderId, "refund", systemStripe).catch(
      (error: unknown) => {
        // Already Refunded, Rejected, or not the Stripe actor's move (staff refunds transition themselves).
        if (!(error instanceof InvalidTransition)) reportError(error);
      },
    );
  }
}
