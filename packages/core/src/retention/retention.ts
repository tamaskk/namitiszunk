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
import { audit } from "../audit/audit";
import { NotFoundError } from "../errors";
import { deleteSmsSentBefore } from "../notify/sms";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_PHONE_DAYS = 30;
const REPORT_EMAIL_DAYS = 90;
const INACTIVE_ACCOUNT_YEARS = 2;
// shortcut: bounds one run; the daily cron deletes a larger backlog over the next days.
const ACCOUNTS_PER_RUN = 500;
// The cancel limit counts one business day; 2 days covers a night that crosses midnight.
const CARD_FINGERPRINT_DAYS = 2;
const FINANCIAL_YEARS = 8;

export type RetentionCounts = {
  // No "phone" in the key: stripPersonalData would drop it from the audit entry.
  ordersContactCleared: number;
  // Problem report e-mails; no "email" in the key for the same reason.
  ordersReportContactCleared: number;
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
 * Whether the account had neither a sign-in nor an order in the last 2 years. Without lastSignInAt
 * (accounts from before T-028) a live session counts as a sign-in, then the account's creation.
 * Staff and platform members keep their accounts: their access is removed by hand first.
 */
async function isInactive(
  userId: Types.ObjectId,
  cutoff: Date,
  session?: ClientSession,
): Promise<boolean> {
  const s = session ?? null;
  const recent = { $gte: cutoff };
  // One by one: a transaction's session must not run operations in parallel.
  const active =
    (await User.exists({
      _id: userId,
      $or: [
        { lastSignInAt: recent },
        { lastSignInAt: { $exists: false }, createdAt: recent },
      ],
    }).session(s)) ??
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
  return !active;
}

/** Accounts that may be inactive: old sign-in (or creation), members excluded up front so they never fill the batch. */
async function accountCandidates(cutoff: Date): Promise<Types.ObjectId[]> {
  const members = [
    ...(await VenueMember.distinct("userId")),
    ...(await PlatformMember.distinct("userId")),
  ];
  const users = await User.find({
    _id: { $nin: members },
    $or: [
      { lastSignInAt: { $lt: cutoff } },
      { lastSignInAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  })
    .sort({ _id: 1 })
    .select("_id")
    .limit(ACCOUNTS_PER_RUN)
    .lean();
  return users.map((user) => user._id);
}

/**
 * Deletes guest accounts inactive for 2 years (T-028) like a guest's own deletion: orders stay for
 * the books without the account. One transaction per account, re-checked inside it, so a sign-in
 * during the run keeps the account and one failure never undoes the others. Each deletion is audited.
 */
export async function runAccountRetention({
  now,
  dryRun,
}: {
  now: Date;
  dryRun: boolean;
}): Promise<{ accountsDeleted: number }> {
  const cutoff = yearsBefore(now, INACTIVE_ACCOUNT_YEARS);
  const candidates = await accountCandidates(cutoff);
  let accountsDeleted = 0;
  const failures: unknown[] = [];
  for (const userId of candidates) {
    if (dryRun) {
      if (await isInactive(userId, cutoff)) accountsDeleted++;
      continue;
    }
    const session = await User.startSession();
    try {
      const deleted = await session.withTransaction(async () => {
        if (!(await isInactive(userId, cutoff, session))) return false;
        const ordersDetached = await removeAccount(userId, session);
        await audit(session, {
          actor: { type: "system", name: "retention" },
          action: "account.deleted",
          target: { type: "user", id: userId },
          after: { ordersDetached, reason: "inactive_2_years" },
        });
        return true;
      });
      if (deleted) accountsDeleted++;
    } catch (error) {
      // Deleted meanwhile by the guest: nothing left to do.
      if (!(error instanceof NotFoundError)) failures.push(error);
    } finally {
      await session.endSession();
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `account retention: ${failures.length} of ${candidates.length} deletions failed`,
      { cause: failures[0] },
    );
  }
  return { accountsDeleted };
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
  const financialFilter = {
    createdAt: { $lt: yearsBefore(now, FINANCIAL_YEARS) },
  };

  if (dryRun) {
    const [
      ordersContactCleared,
      ordersReportContactCleared,
      paymentsFingerprintCleared,
      ordersDeleted,
      paymentsDeleted,
      refundsDeleted,
    ] = await Promise.all([
      Order.countDocuments(phoneFilter),
      Order.countDocuments(reportEmailFilter),
      Payment.countDocuments(fingerprintFilter),
      Order.countDocuments(financialFilter),
      Payment.countDocuments(financialFilter),
      Refund.countDocuments(financialFilter),
    ]);
    return {
      ordersContactCleared,
      ordersReportContactCleared,
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
