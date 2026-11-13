import "server-only";

import { TZDate } from "@date-fns/tz";
import { Venue } from "@namitiszunk/db";
import type Stripe from "stripe";

import { hitRateLimit, type RateLimitRule } from "../api/rate-limit";
import { type Actor, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { type TableFile, writeTableFile } from "../export/table-file";
import { reportError } from "../report-error";
import { stripe } from "./stripe-client";

/** The Payouts page's view of the venue's account, from our database (no Stripe call). */
export type PayoutAccount =
  | { connected: false }
  | {
      connected: true;
      accountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      /** Stripe requirement keys still due; the Owner gets a new onboarding link for them. */
      requirementsDue: string[];
      timeZone: string;
    };

/** A connected account as `getPayoutAccount` returned it, i.e. after the Owner check. */
export type ConnectedPayoutAccount = Extract<
  PayoutAccount,
  { connected: true }
>;

export type PayoutRow = {
  id: string;
  amountHuf: number;
  arrivalDate: Date;
  status: string;
};

/** What the Owner sees on Payouts (T-059); amounts in whole forints. */
export type PayoutOverview = {
  availableHuf: number;
  pendingHuf: number;
  /** The next payout on its way (pending or in transit), soonest first; null when none. */
  nextPayout: PayoutRow | null;
  payouts: PayoutRow[];
  /** Disputes waiting for the venue or under review. */
  openDisputes: {
    id: string;
    amountHuf: number;
    reason: string;
    dueBy: Date | null;
  }[];
  /** Stripe's payout schedule (daily, weekly, monthly, manual); null when unknown. */
  interval: string | null;
  fetchedAt: Date;
};

// Stripe counts HUF in fillér (two decimals); the platform shows and stores whole forints. HUF
// charges and payouts are whole forints in practice, so rounding each figure keeps rows summing.
// `|| 0` turns Math.round's -0 (a tiny negative) into 0, so no "-0 Ft" shows.
const toHuf = (minor: number) => Math.round(minor / 100) || 0;
const isHuf = (row: { currency: string }) => row.currency === "huf";

const sumHuf = (amounts: { amount: number; currency: string }[]) =>
  toHuf(amounts.filter(isHuf).reduce((sum, a) => sum + a.amount, 0));

const openDisputeStatuses = new Set<Stripe.Dispute.Status>([
  "needs_response",
  "warning_needs_response",
  "under_review",
  "warning_under_review",
]);

const payoutRow = (p: Stripe.Payout): PayoutRow => ({
  id: p.id,
  amountHuf: toHuf(p.amount),
  arrivalDate: new Date(p.arrival_date * 1000),
  status: p.status,
});

/** Owner only (`payout.manage`): whether the venue is connected, from our mirror of the account. */
export async function getPayoutAccount(
  actor: Actor,
  venueId: string,
): Promise<PayoutAccount> {
  requirePermission(actor, "payout.manage", { venueId });
  const venue = await Venue.findById(venueId)
    .select(
      "stripeAccountId chargesEnabled payoutsEnabled stripeRequirementsDue timezone",
    )
    .lean();
  if (!venue) throw new NotFoundError();
  if (!venue.stripeAccountId) return { connected: false };
  return {
    connected: true,
    accountId: venue.stripeAccountId,
    chargesEnabled: venue.chargesEnabled ?? false,
    payoutsEnabled: venue.payoutsEnabled ?? false,
    requirementsDue: venue.stripeRequirementsDue ?? [],
    timeZone: venue.timezone ?? "Europe/Budapest",
  };
}

/**
 * Balance, payouts and open disputes of a connected account, read from Stripe on the account
 * (`stripeAccount`). It takes `getPayoutAccount`'s result, so a caller cannot reach it without the
 * Owner check. The Admin caches it for 5 minutes per venue.
 */
export async function fetchPayoutOverview(
  { accountId }: ConnectedPayoutAccount,
  now = new Date(),
): Promise<PayoutOverview> {
  const on = { stripeAccount: accountId };
  const [balance, payouts, disputes, account] = await Promise.all([
    stripe().balance.retrieve({}, on),
    stripe().payouts.list({ limit: 20 }, on),
    // shortcut: the newest 100 disputes; an open one older than that is missed, page further if a venue ever has that many.
    stripe().disputes.list({ limit: 100 }, on),
    stripe().accounts.retrieve(accountId),
  ]);
  // Charges are forints only; a foreign-currency entry would be left out of the figures, so flag it.
  if (
    ![
      ...balance.available,
      ...balance.pending,
      ...payouts.data,
      ...disputes.data,
    ].every(isHuf)
  )
    reportError(
      new Error(`Non-HUF entry left out of the payout overview (${accountId})`),
    );
  const rows = payouts.data.filter(isHuf).map(payoutRow);
  const upcoming = rows
    .filter((p) => p.status === "pending" || p.status === "in_transit")
    .sort((a, b) => a.arrivalDate.getTime() - b.arrivalDate.getTime());
  return {
    availableHuf: sumHuf(balance.available),
    pendingHuf: sumHuf(balance.pending),
    nextPayout: upcoming[0] ?? null,
    payouts: rows,
    openDisputes: disputes.data
      .filter((d) => isHuf(d) && openDisputeStatuses.has(d.status))
      .map((d) => ({
        id: d.id,
        amountHuf: toHuf(d.amount),
        reason: d.reason,
        dueBy: d.evidence_details?.due_by
          ? new Date(d.evidence_details.due_by * 1000)
          : null,
      })),
    interval: account.settings?.payouts?.schedule?.interval ?? null,
    fetchedAt: now,
  };
}

export const payoutExportColumns = [
  "createdAt",
  "type",
  "description",
  "grossHuf",
  "stripeFeeHuf",
  "platformFeeHuf",
  "netHuf",
  "payoutId",
] as const;
export type PayoutExportColumn = (typeof payoutExportColumns)[number];

/** Stripe balance transaction types the export names in the user's language; others show as stored. */
export const payoutTransactionTypes = [
  "charge",
  "payment",
  "refund",
  "payment_refund",
  "payout",
  "adjustment",
  "dispute",
  "stripe_fee",
] as const;

export type PayoutExportLabels = {
  /** The user's locale, for the time column. */
  locale: string;
  columns: Record<PayoutExportColumn, string>;
  /** Stripe balance transaction types (charge, refund, payout…); an unknown one shows as stored. */
  types: Record<string, string>;
  filename: string;
  sheet: string;
};

// One file fits a serverless response; one more row is fetched to tell "too many" apart, and Stripe's
// autoPagingToArray refuses a limit above 10 000.
export const PAYOUT_EXPORT_MAX_ROWS = 9_999;
// Up to 100 Stripe list pages per export: kept low and per venue, so the platform's Stripe quota holds.
const EXPORT_RATE: RateLimitRule = { limit: 3, windowSeconds: 60 };

const feeOf = (tx: Stripe.BalanceTransaction, type: string) =>
  toHuf(
    tx.fee_details
      .filter((f) => f.type === type)
      .reduce((sum, f) => sum + f.amount, 0),
  );

/**
 * The account's balance transactions of days `from`–`to` (venue time zone) for the accountant:
 * gross, Stripe fee, platform fee, net and the payout each one went out with. No guest data.
 */
export async function exportBalanceTransactions(
  actor: Actor,
  venueId: string,
  range: { from: string; to: string; format: "csv" | "xlsx" },
  labels: PayoutExportLabels,
): Promise<TableFile> {
  const account = await getPayoutAccount(actor, venueId);
  if (!account.connected) throw new ConflictError("stripe_account_missing");
  if (await hitRateLimit(`payouts-export:${venueId}`, EXPORT_RATE))
    throw new AppError(429, "rate_limited");
  const { timeZone } = account;
  // Whole local days: from 00:00 of `from` to 00:00 after `to`, in the venue's zone.
  const dayStart = (date: string, plusDays = 0) => {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return Math.floor(
      new TZDate(y, m - 1, d + plusDays, 0, 0, timeZone).getTime() / 1000,
    );
  };

  const transactions = await stripe()
    .balanceTransactions.list(
      {
        created: {
          gte: dayStart(range.from),
          lt: dayStart(range.to, 1),
        },
        limit: 100,
      },
      { stripeAccount: account.accountId },
    )
    .autoPagingToArray({ limit: PAYOUT_EXPORT_MAX_ROWS + 1 });
  if (transactions.length > PAYOUT_EXPORT_MAX_ROWS)
    throw new ConflictError("export_too_large");
  // A row in another currency would be read as forints by the accountant: refuse instead.
  if (!transactions.every(isHuf))
    throw new ConflictError("export_currency_unsupported");

  const time = new Intl.DateTimeFormat(labels.locale, {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  });
  const rows = transactions
    .sort((a, b) => a.created - b.created)
    .map((tx) => {
      const row: Record<PayoutExportColumn, string | number> = {
        createdAt: time.format(new Date(tx.created * 1000)),
        type: labels.types[tx.type] ?? tx.type,
        description: tx.description ?? "",
        grossHuf: toHuf(tx.amount),
        stripeFeeHuf: feeOf(tx, "stripe_fee"),
        platformFeeHuf: feeOf(tx, "application_fee"),
        netHuf: toHuf(tx.net),
        payoutId:
          tx.type === "payout"
            ? tx.source && typeof tx.source !== "string"
              ? tx.source.id
              : (tx.source ?? "")
            : "",
      };
      return payoutExportColumns.map((column) => row[column]);
    });
  return writeTableFile({
    header: payoutExportColumns.map((column) => labels.columns[column]),
    rows,
    hufColumns: payoutExportColumns.map((column) => column.endsWith("Huf")),
    format: range.format,
    filename: `${labels.filename}-${range.from}_${range.to}`,
    sheet: labels.sheet,
  });
}
