import "server-only";

import {
  Order,
  Payment,
  PlatformMember,
  Refund,
  Types,
  User,
  VenueMember,
} from "@namitiszunk/db";
import type { ClientSession } from "mongoose";

import { removeAccount } from "../account/account";
import { deleteSmsSentBefore } from "../notify/sms";

import { audit } from "../audit/audit";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_PHONE_DAYS = 30;
const REPORT_EMAIL_DAYS = 90;
const INACTIVE_ACCOUNT_YEARS = 2;
// shortcut: bounds one run's transaction; the daily cron catches up on a larger backlog over the next days.
const ACCOUNTS_PER_RUN = 500;
// The cancel limit counts one business day; 2 days covers a night that crosses midnight.
const CARD_FINGERPRINT_DAYS = 2;
const FINANCIAL_YEARS = 8;

export type RetentionCounts = {
  // No "phone" in the key: stripPersonalData would drop it from the audit entry.
  ordersContactCleared: number;
  // Problem report e-mails; no "email" in the key for the same reason.
  ordersReportContactCleared: number;
  accountsDeleted: number;
  paymentsFingerprintCleared: number;
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
 * Guest accounts with neither a sign-in nor an order in the last 2 years. Without lastSignInAt (accounts
 * from before T-028) a live session counts as a sign-in, then the account's creation. Staff and platform
 * members keep their accounts: their access is removed by hand first.
 */
async function inactiveAccounts(
  cutoff: Date,
  session?: ClientSession,
): Promise<Types.ObjectId[]> {
  const s = session ?? null;
  const candidates = await User.find({
    $or: [
      { lastSignInAt: { $lt: cutoff } },
      { lastSignInAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  })
    .select("_id")
    .limit(ACCOUNTS_PER_RUN)
    .session(s)
    .lean();
  const inactive: Types.ObjectId[] = [];
  const recent = { $gte: cutoff };
  for (const { _id: userId } of candidates) {
    // One by one: a transaction's session must not run operations in parallel.
    const active =
      (await VenueMember.exists({ userId }).session(s)) ??
      (await PlatformMember.exists({ userId }).session(s)) ??
      (await Order.exists({ userId, createdAt: recent }).session(s)) ??
      (await User.db.collection("session").findOne(
        {
          userId: { $in: [userId, String(userId)] },
          $or: [{ createdAt: recent }, { updatedAt: recent }],
        },
        { session, projection: { _id: 1 } },
      ));
    if (!active) inactive.push(userId);
  }
  return inactive;
}

/**
 * Applies the retention periods of docs/SECURITY.md. Audit log entries are never deleted (v1).
 * "Older than" is strict and measured from createdAt, when the order (or payment, refund) was created.
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
  const fingerprintFilter = {
    cardFingerprint: { $exists: true },
    createdAt: {
      $lt: new Date(now.getTime() - CARD_FINGERPRINT_DAYS * DAY_MS),
    },
  };
  const reportEmailCutoff = new Date(
    now.getTime() - REPORT_EMAIL_DAYS * DAY_MS,
  );
  const oldReportEmail = {
    email: { $type: "string" as const },
    createdAt: { $lt: reportEmailCutoff },
  };
  const reportEmailFilter = { problemReports: { $elemMatch: oldReportEmail } };
  const accountCutoff = yearsBefore(now, INACTIVE_ACCOUNT_YEARS);
  const financialFilter = {
    createdAt: { $lt: yearsBefore(now, FINANCIAL_YEARS) },
  };

  if (dryRun) {
    const [
      ordersContactCleared,
      ordersReportContactCleared,
      accounts,
      paymentsFingerprintCleared,
      ordersDeleted,
      paymentsDeleted,
      refundsDeleted,
    ] = await Promise.all([
      Order.countDocuments(phoneFilter),
      Order.countDocuments(reportEmailFilter),
      inactiveAccounts(accountCutoff),
      Payment.countDocuments(fingerprintFilter),
      Order.countDocuments(financialFilter),
      Payment.countDocuments(financialFilter),
      Refund.countDocuments(financialFilter),
    ]);
    return {
      ordersContactCleared,
      ordersReportContactCleared,
      accountsDeleted: accounts.length,
      paymentsFingerprintCleared,
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
      const reportEmails = await Order.updateMany(
        reportEmailFilter,
        { $unset: { "problemReports.$[old].email": 1 } },
        {
          session,
          arrayFilters: [
            {
              "old.email": oldReportEmail.email,
              "old.createdAt": oldReportEmail.createdAt,
            },
          ],
        },
      );
      // Before the 8-year deletion, so an old account's orders are detached, not counted twice.
      const accounts = await inactiveAccounts(accountCutoff, session);
      for (const userId of accounts) await removeAccount(userId, session);
      const fingerprints = await Payment.updateMany(
        fingerprintFilter,
        { $unset: { cardFingerprint: 1 } },
        { session },
      );
      const orders = await Order.deleteMany(financialFilter, { session });
      const payments = await Payment.deleteMany(financialFilter, { session });
      const refunds = await Refund.deleteMany(financialFilter, { session });
      const counts: RetentionCounts = {
        ordersContactCleared: cleared.modifiedCount,
        ordersReportContactCleared: reportEmails.modifiedCount,
        accountsDeleted: accounts.length,
        paymentsFingerprintCleared: fingerprints.modifiedCount,
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

/**
 * Deletes Twilio's log of the SMS sent more than 30 days ago, the guest phone's retention (T-028).
 * Apart from runRetention, so a Twilio outage never rolls back the database clean-up.
 */
export function runSmsLogRetention(now: Date): Promise<number> {
  return deleteSmsSentBefore(
    new Date(now.getTime() - GUEST_PHONE_DAYS * DAY_MS),
  );
}
