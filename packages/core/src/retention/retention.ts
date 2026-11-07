import "server-only";

import { Order, Payment, Refund, Types } from "@namitiszunk/db";

import { audit } from "../audit/audit";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_PHONE_DAYS = 30;
const FINANCIAL_YEARS = 8;

export type RetentionCounts = {
  // No "phone" in the key: stripPersonalData would drop it from the audit entry.
  ordersContactCleared: number;
  ordersDeleted: number;
  paymentsDeleted: number;
  refundsDeleted: number;
};

function yearsBefore(now: Date, years: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

/**
 * Applies the retention periods of docs/SECURITY.md. Audit log entries are never deleted (v1).
 * "Older than" is strict and measured from createdAt, when the order (or payment, refund) was created.
 * shortcut: inactive accounts (2 years) are not handled; User has no last-login field until T-030/T-036.
 */
export async function runRetention({
  now,
  dryRun,
}: {
  now: Date;
  dryRun: boolean;
}): Promise<RetentionCounts> {
  const phoneFilter = {
    guestPhone: { $type: "string" as const },
    createdAt: { $lt: new Date(now.getTime() - GUEST_PHONE_DAYS * DAY_MS) },
  };
  const financialFilter = {
    createdAt: { $lt: yearsBefore(now, FINANCIAL_YEARS) },
  };

  if (dryRun) {
    const [
      ordersContactCleared,
      ordersDeleted,
      paymentsDeleted,
      refundsDeleted,
    ] = await Promise.all([
      Order.countDocuments(phoneFilter),
      Order.countDocuments(financialFilter),
      Payment.countDocuments(financialFilter),
      Refund.countDocuments(financialFilter),
    ]);
    return {
      ordersContactCleared,
      ordersDeleted,
      paymentsDeleted,
      refundsDeleted,
    };
  }

  const session = await Order.startSession();
  try {
    return await session.withTransaction(async () => {
      // Sequential: one transaction's session must not run operations in parallel.
      const cleared = await Order.updateMany(
        phoneFilter,
        { $unset: { guestPhone: 1 } },
        { session },
      );
      const orders = await Order.deleteMany(financialFilter, { session });
      const payments = await Payment.deleteMany(financialFilter, { session });
      const refunds = await Refund.deleteMany(financialFilter, { session });
      const counts: RetentionCounts = {
        ordersContactCleared: cleared.modifiedCount,
        ordersDeleted: orders.deletedCount,
        paymentsDeleted: payments.deletedCount,
        refundsDeleted: refunds.deletedCount,
      };
      // A run with nothing to remove leaves the database untouched, so reruns are no-ops.
      if (Object.values(counts).some((count) => count > 0)) {
        await audit(session, {
          actor: { type: "system", name: "retention" },
          action: "retention.run",
          target: { type: "retention_run", id: new Types.ObjectId() },
          after: { ...counts, ranAt: now },
        });
      }
      return counts;
    });
  } finally {
    await session.endSession();
  }
}
