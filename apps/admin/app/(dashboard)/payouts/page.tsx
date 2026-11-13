import { getPayoutAccount } from "@namitiszunk/core/payments";
import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { ExportRange } from "@/components/export-range";
import { requireAdminModule } from "@/lib/admin-context";

import { cachedPayoutOverview } from "./overview";
import {
  DashboardButton,
  OnboardingButton,
  RefreshButton,
  ScheduleSelect,
} from "./payouts-controls";

export const instant = false;

const knownStatuses = new Set([
  "paid",
  "pending",
  "in_transit",
  "canceled",
  "failed",
]);

// Stripe's dispute reason codes with copy in hu and en; a newer code shows as Stripe sends it.
const knownReasons = new Set([
  "credit_not_processed",
  "duplicate",
  "fraudulent",
  "general",
  "product_not_received",
  "product_unacceptable",
  "unrecognized",
]);

/** Payouts (T-059): Owner only; the connected account's balance, payouts, disputes and export. */
export default async function PayoutsPage({
  searchParams,
}: PageProps<"/payouts">) {
  const [{ actor, venue }, { stripe: back }, t, tErrors, format] =
    await Promise.all([
      requireAdminModule("payouts"),
      searchParams,
      getTranslations("admin"),
      getTranslations("apiErrors"),
      getFormatter(),
    ]);
  const account = await getPayoutAccount(actor, venue.id);
  // The Express Dashboard can change the bank account: it needs a session confirmed with 2FA.
  const twoFactor = actor.kind === "user" && actor.twoFactorVerified === true;
  const heading = (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1">{t("nav.payouts")}</h1>
      <p className="text-small text-text-muted">{t("payouts.intro")}</p>
    </div>
  );

  if (!account.connected)
    return (
      <div className="flex max-w-content flex-col gap-6">
        {heading}
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3">{t("payouts.connect.title")}</h2>
          <p className="text-body">{t("payouts.connect.body")}</p>
          <OnboardingButton
            label={t("payouts.connect.button")}
            className="self-start"
          />
        </section>
      </div>
    );

  const overview = await cachedPayoutOverview(venue.id, account);
  const day = (date: Date) => format.dateTime(date, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  // The export defaults to the venue's day the figures were read on (en-CA formats as YYYY-MM-DD).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: account.timeZone,
  }).format(overview.fetchedAt);
  const reason = (code: string) =>
    knownReasons.has(code)
      ? // The cast names one key so next-intl's key union stays small; the set above guards it.
        t(`payouts.disputes.reasons.${code as "general"}`)
      : code;

  return (
    <div className="flex max-w-content flex-col gap-6">
      {heading}
      {overview.openDisputes.length > 0 && (
        <section className="flex flex-col gap-4 rounded-lg border border-danger bg-surface p-6">
          <h2 className="text-h3 text-danger">
            {t("payouts.disputes.title", {
              count: overview.openDisputes.length,
            })}
          </h2>
          <p className="text-body">{t("payouts.disputes.body")}</p>
          <ul className="flex flex-col gap-1 text-small tabular-nums">
            {overview.openDisputes.map((dispute) => (
              <li key={dispute.id}>
                {dispute.dueBy
                  ? t("payouts.disputes.item", {
                      amount: formatHuf(dispute.amountHuf),
                      reason: reason(dispute.reason),
                      dueBy: day(dispute.dueBy),
                    })
                  : t("payouts.disputes.noDue", {
                      amount: formatHuf(dispute.amountHuf),
                      reason: reason(dispute.reason),
                    })}
              </li>
            ))}
          </ul>
          {twoFactor && <DashboardButton className="self-start" />}
        </section>
      )}
      {back === "return" && account.requirementsDue.length === 0 && (
        <p role="status" className="text-small text-text-muted">
          {t("payouts.connect.returned")}
        </p>
      )}
      {!twoFactor && (
        <section className="flex flex-col gap-4 rounded-lg border border-warning bg-surface p-6">
          <h2 className="text-h3 text-warning">
            {t("payouts.twoFactor.title")}
          </h2>
          <p className="text-body">{t("payouts.twoFactor.body")}</p>
          <Button asChild className="self-start">
            <Link href="/profile">{t("payouts.twoFactor.button")}</Link>
          </Button>
        </section>
      )}
      {account.requirementsDue.length > 0 && (
        <section className="flex flex-col gap-4 rounded-lg border border-warning bg-surface p-6">
          <h2 className="text-h3 text-warning">
            {t("payouts.requirements.title")}
          </h2>
          <p className="text-body">
            {t("payouts.requirements.body", {
              count: account.requirementsDue.length,
            })}
          </p>
          <OnboardingButton
            label={t("payouts.requirements.button")}
            className="self-start"
          />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {twoFactor && overview.openDisputes.length === 0 && <DashboardButton />}
        <RefreshButton />
        <p className="text-small text-text-muted">
          {t("payouts.fetchedAt", {
            time: format.dateTime(overview.fetchedAt, { timeStyle: "short" }),
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3">{t("payouts.balance.title")}</h2>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-small text-text-muted">
              {t("payouts.balance.available")}
            </dt>
            <dd className="text-body tabular-nums">
              {formatHuf(overview.availableHuf)}
            </dd>
            <dt className="text-small text-text-muted">
              {t("payouts.balance.pending")}
            </dt>
            <dd className="text-body tabular-nums">
              {formatHuf(overview.pendingHuf)}
            </dd>
          </dl>
        </section>
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3">{t("payouts.next.title")}</h2>
          <p className="text-body tabular-nums">
            {overview.nextPayout
              ? t("payouts.next.arrives", {
                  amount: formatHuf(overview.nextPayout.amountHuf),
                  date: day(overview.nextPayout.arrivalDate),
                })
              : t("payouts.next.none")}
          </p>
        </section>
      </div>

      <ScheduleSelect interval={overview.interval} disabled={!twoFactor} />

      <section aria-labelledby="payouts-list" className="flex flex-col gap-4">
        <h2 id="payouts-list" className="text-h3">
          {t("payouts.list.title")}
        </h2>
        {overview.payouts.length === 0 ? (
          <EmptyState message={t("payouts.list.empty")} />
        ) : (
          <Table label={t("payouts.list.title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("payouts.list.arrival")}</TableHead>
                <TableHead className="text-right">
                  {t("payouts.list.amount")}
                </TableHead>
                <TableHead>{t("payouts.list.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.payouts.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>{day(payout.arrivalDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHuf(payout.amountHuf)}
                  </TableCell>
                  <TableCell>
                    {knownStatuses.has(payout.status)
                      ? t(`payouts.statuses.${payout.status as "paid"}`)
                      : payout.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <ExportRange
        id="payouts-export"
        path="/payouts/export"
        initialDate={today}
        labels={{
          title: t("payouts.export.title"),
          from: t("payouts.export.from"),
          to: t("payouts.export.to"),
          hint: t("payouts.export.hint"),
          invalidRange: t("payouts.export.invalidRange"),
          csv: t("payouts.export.csv"),
          xlsx: t("payouts.export.xlsx"),
          failed: tErrors("internal"),
        }}
      />
    </div>
  );
}
