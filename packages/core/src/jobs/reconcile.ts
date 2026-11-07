import "server-only";

import { Payment, Refund } from "@namitiszunk/db";

/** One succeeded Stripe charge, amounts already converted to integer forints at the Stripe boundary. */
export type StripeCharge = {
  paymentIntentId: string;
  amountHuf: number;
  refundedHuf: number;
};

export type ReconcileMismatch = {
  paymentIntentId: string;
  problem:
    "missing_in_db" | "missing_in_stripe" | "status" | "amount" | "refunded";
  stripe?: { amountHuf: number; refundedHuf: number };
  db?: { amountHuf: number; refundedHuf: number; status: string };
};

const settled: string[] = ["succeeded", "refunded", "partially_refunded"];
// A PaymentIntent is cancelled 15 minutes after creation, so one created this long before `to` was charged by then.
const SETTLE_MARGIN_MS = 30 * 60 * 1000;

/**
 * Compares Stripe's succeeded charges in [from, to) with the Payment and Refund documents.
 * Payments are matched by PaymentIntent id, so a charge just after `from` for an older Payment still matches.
 */
export async function reconcileStripe(
  range: { from: Date; to: Date },
  listStripeCharges: (range: {
    from: Date;
    to: Date;
  }) => Promise<StripeCharge[]>,
): Promise<ReconcileMismatch[]> {
  const charges = await listStripeCharges(range);
  const byIntent = new Map(charges.map((c) => [c.paymentIntentId, c]));
  const payments = await Payment.find({
    $or: [
      { stripePaymentIntentId: { $in: [...byIntent.keys()] } },
      {
        status: { $in: ["succeeded", "refunded", "partially_refunded"] },
        createdAt: {
          $gte: range.from,
          $lt: new Date(range.to.getTime() - SETTLE_MARGIN_MS),
        },
      },
    ],
  })
    .select("stripePaymentIntentId amountHuf status")
    .lean();
  const refunds = await Refund.find({
    paymentId: { $in: payments.map((p) => p._id) },
    status: "succeeded",
  })
    .select("paymentId amountHuf")
    .lean();
  const refundedBy = new Map<string, number>();
  for (const r of refunds) {
    const key = String(r.paymentId);
    refundedBy.set(key, (refundedBy.get(key) ?? 0) + r.amountHuf);
  }

  const mismatches: ReconcileMismatch[] = [];
  const seen = new Set<string>();
  for (const p of payments) {
    const id = p.stripePaymentIntentId;
    seen.add(id);
    const db = {
      amountHuf: p.amountHuf,
      refundedHuf: refundedBy.get(String(p._id)) ?? 0,
      status: p.status ?? "requires_payment",
    };
    const charge = byIntent.get(id);
    if (!charge) {
      mismatches.push({
        paymentIntentId: id,
        problem: "missing_in_stripe",
        db,
      });
      continue;
    }
    const stripe = {
      amountHuf: charge.amountHuf,
      refundedHuf: charge.refundedHuf,
    };
    const problem = !settled.includes(db.status)
      ? "status"
      : db.amountHuf !== stripe.amountHuf
        ? "amount"
        : db.refundedHuf !== stripe.refundedHuf
          ? "refunded"
          : null;
    if (problem) mismatches.push({ paymentIntentId: id, problem, stripe, db });
  }
  for (const c of charges) {
    if (!seen.has(c.paymentIntentId)) {
      mismatches.push({
        paymentIntentId: c.paymentIntentId,
        problem: "missing_in_db",
        stripe: { amountHuf: c.amountHuf, refundedHuf: c.refundedHuf },
      });
    }
  }
  return mismatches;
}
