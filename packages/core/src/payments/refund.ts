import "server-only";

import {
  type ClientSession,
  Order,
  type OrderStatus,
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
  type PlatformRole,
  requirePermission,
  type Resource,
  type VenueRole,
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

const refundResource = (
  venueId: string,
  amountHuf?: number,
  managerRefundLimitHuf: number | null = MANAGER_REFUND_LIMIT_HUF,
): Resource => ({ venueId, amountHuf, managerRefundLimitHuf });

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
  kind: "staff" | "user" | "system";
  userId?: string;
  memberId?: string;
  role?: VenueRole;
  platformRole?: PlatformRole;
  confirmedWrite?: boolean;
  source?: "stripe" | "inngest";
};

/** Initiator as stored; older Refunds have no `kind`. */
type StoredInitiator = {
  kind?: string | null;
  userId?: string | null;
  memberId?: string | null;
  role?: string | null;
  platformRole?: string | null;
  confirmedWrite?: boolean | null;
};

/** Who started the refund, with only the ids and roles needed to rebuild the actor later. */
function initiatorOf(actor: Actor, venueId: string): Initiator {
  switch (actor.kind) {
    case "staff":
      return {
        type: "venue_member",
        id: actor.memberId,
        kind: "staff",
        memberId: actor.memberId,
        role: actor.role,
      };
    case "user": {
      const member = actor.memberships.find((m) => m.venueId === venueId);
      return {
        type: member ? "venue_member" : "platform_member",
        id: member?.memberId ?? actor.userId,
        kind: "user",
        userId: actor.userId,
        memberId: member?.memberId,
        role: member?.role,
        platformRole: actor.platformRole,
        confirmedWrite: actor.confirmedWrite,
      };
    }
    case "system":
      return { type: "system", kind: "system", source: actor.source };
    case "guest":
      // requirePermission never lets a guest this far.
      throw new Error("a guest cannot refund");
  }
}

/** The actor that makes the order's `refund` transition once Stripe confirms; system refunds use the Stripe actor. */
function initiatorActor(
  by: StoredInitiator | null | undefined,
  venueId: string,
): Actor {
  if (by?.kind === "staff" && by.memberId && by.role) {
    return {
      kind: "staff",
      venueId,
      memberId: by.memberId,
      role: by.role as VenueRole,
    };
  }
  if (by?.kind === "user" && by.userId) {
    return {
      kind: "user",
      userId: by.userId,
      memberships:
        by.memberId && by.role
          ? [{ venueId, memberId: by.memberId, role: by.role as VenueRole }]
          : [],
      ...(by.platformRole && {
        platformRole: by.platformRole as PlatformRole,
      }),
      ...(by.confirmedWrite && { confirmedWrite: true }),
    };
  }
  return systemStripe;
}

const venueRoleOf = (actor: Actor, venueId: string): string | undefined =>
  actor.kind === "staff"
    ? actor.role
    : actor.kind === "user"
      ? actor.memberships.find((m) => m.venueId === venueId)?.role
      : undefined;

/**
 * Staff refund handed-over orders only (Picked up, Expired). A cancelled order paid late is refunded
 * by the system, or by HQ after the write confirmation. The system also refunds Rejected orders;
 * Refunded lets a retried system refund find nothing left instead of failing.
 */
function mayRefundIn(status: OrderStatus, actor: Actor): boolean {
  if (actor.kind === "system")
    return ["rejected", "expired", "cancelled", "refunded"].includes(status);
  if (status === "picked_up" || status === "expired") return true;
  return (
    status === "cancelled" &&
    actor.kind === "user" &&
    actor.confirmedWrite === true &&
    (actor.platformRole === "support" || actor.platformRole === "admin")
  );
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

/** Only a definitive answer from Stripe (a 4xx other than rate limiting) means the refund was not made. */
function rejectedByStripe(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { type, statusCode } = error as {
    type?: unknown;
    statusCode?: unknown;
  };
  if (type === "StripeInvalidRequestError" || type === "StripeCardError")
    return true;
  return (
    typeof type === "string" &&
    type.startsWith("Stripe") &&
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode < 500 &&
    statusCode !== 429
  );
}

/**
 * Sends a committed Refund to Stripe on the venue's connected account. The Refund id is the
 * idempotency key, so sending the same Refund again never makes a second Stripe refund.
 * A definitive Stripe rejection marks it failed; a timeout, network error or 5xx leaves it pending
 * (counted as refunded) for a resend with the same key. Either way it is reported: never a silent loss.
 */
async function sendToStripe(refund: SentRefund): Promise<RefundResult> {
  const [payment, venue] = await Promise.all([
    Payment.findById(refund.paymentId).select("stripePaymentIntentId").lean(),
    Venue.findById(refund.venueId).select("stripeAccountId").lean(),
  ]);
  const refundId = String(refund._id);
  const pending: RefundResult = {
    refundId,
    amountHuf: refund.amountHuf,
    status: "pending",
  };
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
    reportError(error);
    if (payment && venue?.stripeAccountId && !rejectedByStripe(error))
      return pending;
    await markFailed(refund);
    throw new ConflictError("refund_failed");
  }
  await Refund.updateOne(
    { _id: refund._id },
    { $set: { stripeRefundId: created.id } },
  );
  // The final status comes from the webhook (charge.refunded, refund.updated).
  return pending;
}

// Stripe keeps idempotency keys for 24 hours; after that a resend could refund twice.
const RESEND_WINDOW_MS = 23 * 60 * 60 * 1000;

/** A Refund Stripe never answered (crash or timeout): resent with the same key while that key is valid. */
async function resend(refund: SentRefund & { createdAt?: Date }) {
  if (
    refund.createdAt &&
    Date.now() - refund.createdAt.getTime() > RESEND_WINDOW_MS
  ) {
    reportError(
      new Error(
        `refund ${String(refund._id)} has had no Stripe answer for a day; check it in Stripe`,
      ),
    );
    return {
      refundId: String(refund._id),
      amountHuf: refund.amountHuf,
      status: "pending" as const,
    };
  }
  return sendToStripe(refund);
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

export type RefundOptions = {
  /** sha256 of the caller and its Idempotency-Key: a repeat returns the Refund it started. */
  requestKey?: string;
  /** The venue's manager limit; defaults to the platform setting. */
  managerRefundLimitHuf?: number | null;
};

/** The Refund a request key already started, resent if Stripe never answered it. */
async function replayed(
  orderId: string,
  requestKey: string,
): Promise<RefundResult | null> {
  const refund = await Refund.findOne({ requestKey }).lean();
  if (!refund) return null;
  if (String(refund.orderId) !== orderId) {
    throw new ConflictError("idempotency_key_reused");
  }
  if (refund.status === "pending" && !refund.stripeRefundId) {
    return resend(refund);
  }
  return {
    refundId: String(refund._id),
    amountHuf: refund.amountHuf,
    status: refund.status,
  };
}

const isDuplicateKey = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 11000;

/**
 * Refunds a paid order in full or in part (docs/fejlesztesi-terv.md #34). The amount may not exceed
 * the part not yet refunded (succeeded and pending refunds count): 409 otherwise.
 * The Refund and its audit entry commit first; Stripe is called after the commit. The order
 * becomes Refunded only when the webhook confirms the full refund (handleRefundEvent).
 */
export async function refundOrder(
  orderId: string,
  amount: RefundAmount,
  reason: string,
  actor: Actor,
  options: RefundOptions = {},
): Promise<RefundResult> {
  if (amount !== "full" && !(Number.isInteger(amount) && amount > 0)) {
    throw new AppError(400, "validation_failed", {
      amountHuf: "validation.huf.min",
    });
  }
  const why = reason.trim();
  if (!why) throw new AppError(400, "reason_required");
  if (!isValidObjectId(orderId)) throw new NotFoundError();
  const { requestKey } = options;
  const limit =
    options.managerRefundLimitHuf === undefined
      ? MANAGER_REFUND_LIMIT_HUF
      : options.managerRefundLimitHuf;
  if (requestKey) {
    const earlier = await replayed(orderId, requestKey);
    if (earlier) return earlier;
  }

  let created: SentRefund | undefined;
  try {
    await inTransaction(async (session) => {
      created = undefined;
      const order = await Order.findById(orderId)
        .select("venueId status")
        .session(session)
        .lean();
      if (!order) throw new NotFoundError();
      const venueId = String(order.venueId);
      // Role check first, so a caller without the permission learns nothing about the order.
      requirePermission(
        actor,
        "order.refund",
        refundResource(venueId, amount === "full" ? undefined : amount, limit),
      );
      // Read in the transaction: a refund never lands on an order still being made or already refunded.
      if (!mayRefundIn(order.status, actor)) {
        throw new ConflictError("refund_not_allowed_in_status");
      }

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
        .select("amountHuf initiatedBy")
        .session(session)
        .lean();
      const remaining =
        payment.amountHuf - open.reduce((sum, r) => sum + r.amountHuf, 0);
      const amountHuf = amount === "full" ? remaining : amount;
      // The manager limit covers all refunds made with the same role on this order, not each one.
      const role = venueRoleOf(actor, venueId);
      const sameRoleHuf = role
        ? open
            .filter((r) => r.initiatedBy?.role === role)
            .reduce((sum, r) => sum + r.amountHuf, 0)
        : 0;
      requirePermission(
        actor,
        "order.refund",
        refundResource(venueId, sameRoleHuf + amountHuf, limit),
      );
      if (amountHuf <= 0 || amountHuf > remaining) {
        throw new ConflictError("refund_exceeds_remaining");
      }

      const [refund] = await Refund.create(
        [
          {
            venueId: order.venueId,
            paymentId: payment._id,
            orderId: order._id,
            amountHuf,
            reason: why,
            initiatedBy: initiatorOf(actor, venueId),
            ...(requestKey && { requestKey }),
          },
        ],
        { session },
      );
      // A platform member acting with their own role is the actor, not an impersonator.
      await audit(session, {
        actor: auditActorOf(actor),
        venueId: order.venueId,
        action: "refund.created",
        target: { type: "refund", id: refund!._id },
        after: { orderId, paymentId: payment._id, amountHuf, reason: why },
      });
      created = refund!.toObject();
    });
  } catch (error) {
    // Two requests with the same key raced: the loser answers with the winner's Refund.
    if (requestKey && isDuplicateKey(error)) {
      const earlier = await replayed(orderId, requestKey);
      if (earlier) return earlier;
    }
    throw error;
  }
  if (!created) throw new Error("transaction finished without a refund");
  return sendToStripe(created);
}

/**
 * Rejection, expiry and a payment that arrived after the timeout cancelled the order (Inngest and
 * the payment webhook): refunds whatever is left, idempotent per order, so a retry never refunds
 * twice. A Refund committed but never answered by Stripe (crash or timeout) is resent first.
 */
export async function refundOrderInFull(
  orderId: string,
  reason: "rejected" | "expired" | "late_payment",
): Promise<void> {
  const unsent = await Refund.find({
    orderId,
    status: "pending",
    stripeRefundId: { $exists: false },
  }).lean();
  for (const refund of unsent) await resend(refund);
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
 * status, and on a full refund the order's `refund` transition as the actor who started the refund.
 * Only Refunds we created (metadata.refundId) are touched.
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
  } else if (event.account) {
    // Events can arrive out of order: act on the refund as Stripe has it now, not on the snapshot.
    stripeRefunds = [
      await stripe().refunds.retrieve(
        event.data.object.id,
        {},
        { stripeAccount: event.account },
      ),
    ];
  } else {
    // No connected account: belongsTo refuses it and it is reported.
    stripeRefunds = [event.data.object];
  }

  let failed: SentRefund[] = [];
  let mismatched: string[] = [];
  let untracked: string[] = [];
  await inTransaction(async (session) => {
    failed = [];
    mismatched = [];
    untracked = [];
    if (!(await claimStripeEvent(session, event))) return;
    const paymentIds = new Set<string>();
    for (const stripeRefund of stripeRefunds) {
      const refundId = stripeRefund.metadata?.refundId;
      if (!refundId) {
        untracked.push(stripeRefund.id);
        continue;
      }
      const status = refundStatusOf(stripeRefund.status);
      if (!status || !isValidObjectId(refundId)) continue;
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
        .select("amountHuf status")
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
  // Made in the Stripe Dashboard or by another tool: our books do not show it.
  for (const id of untracked) {
    reportError(
      new Error(`Stripe refund ${id} (event ${event.id}) has no Refund here`),
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
  await completeFullRefunds(stripeRefunds);
}

/**
 * The order's `refund` transition for every fully refunded Payment this event touched. It reads the
 * stored state, not this delivery's changes, so when it fails the error makes Stripe redeliver and
 * the redelivery (already claimed) still finishes it.
 */
async function completeFullRefunds(stripeRefunds: Stripe.Refund[]) {
  const ids = stripeRefunds
    .map((r) => r.metadata?.refundId)
    .filter((id): id is string => !!id && isValidObjectId(id));
  if (ids.length === 0) return;
  const paymentIds = await Refund.distinct("paymentId", {
    _id: { $in: ids },
    status: "succeeded",
  });
  const payments = await Payment.find({
    _id: { $in: paymentIds },
    status: "refunded",
  })
    .select("orderId venueId")
    .lean();
  for (const payment of payments) {
    const last = await Refund.findOne({
      paymentId: payment._id,
      status: "succeeded",
    })
      .sort({ createdAt: -1 })
      .select("initiatedBy reason amountHuf")
      .lean();
    const actor = initiatorActor(last?.initiatedBy, String(payment.venueId));
    try {
      await transition(String(payment.orderId), "refund", actor, {
        reason: last?.reason,
        // The limit was checked when the refund was made; the money is already back.
        resource: { amountHuf: last?.amountHuf, managerRefundLimitHuf: null },
      });
    } catch (error) {
      // Already Refunded, or not this actor's move (Rejected, Cancelled, an expiry without refundOnExpiry).
      if (error instanceof InvalidTransition) continue;
      // The initiator lost access since: report it, a redelivery would not change that.
      if (error instanceof AppError) {
        reportError(error);
        continue;
      }
      throw error;
    }
  }
}
