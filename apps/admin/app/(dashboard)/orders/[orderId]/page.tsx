import { NotFoundError } from "@namitiszunk/core/errors";
import { getVenueOrder, type Who } from "@namitiszunk/core/orders/admin";
import { formatHuf } from "@namitiszunk/i18n";
import { Badge, Button } from "@namitiszunk/ui";
import { objectIdSchema } from "@namitiszunk/validators";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { requireAdminModule } from "@/lib/admin-context";

import { badgeOf } from "../status-badge";
import { OrderActions } from "./order-actions";

export const instant = false;

export const metadata: Metadata = { robots: { index: false } };

/** One order for a manager or owner (T-056): what was ordered, paid, refunded, and who did what. */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { actor } = await requireAdminModule("orders");
  if (!objectIdSchema.safeParse(orderId).success) notFound();
  const [order, t, format] = await Promise.all([
    getVenueOrder(actor, orderId).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getTranslations("admin.orders"),
    getFormatter(),
  ]);
  const number = order.shortNumber ?? t("list.noNumber");
  const when = (at: Date) =>
    format.dateTime(at, { dateStyle: "short", timeStyle: "short" });
  const name = (who: Who) =>
    who.name ??
    {
      system: t("detail.system"),
      platform: t("detail.platform"),
      guest: t("detail.guest"),
      staff: t("detail.unknown"),
    }[who.kind];
  // Audit actions and report categories come from stored data: an unknown one shows as stored.
  type Key = Parameters<typeof t>[0];
  const actionLabel = (action: string) => {
    const key = `detail.actions.${action.replace(".", "_")}` as Key;
    return t.has(key) ? t(key) : action;
  };
  const a = order.amounts;
  const wallet = (value: string) => {
    const key = `filters.methods.${value}` as Key;
    return t.has(key) ? t(key) : value;
  };
  const payment = order.payment;
  const method = payment
    ? [payment.wallet && wallet(payment.wallet), payment.card]
        .filter(Boolean)
        .join(", ") || t("filters.methods.card")
    : null;
  // The business day is a calendar date: noon UTC keeps it on the same day in any time zone.
  const businessDay = format.dateTime(
    new Date(`${order.businessDate}T12:00:00Z`),
    { dateStyle: "medium", timeZone: "UTC" },
  );
  const category = (value: string) => {
    const key = `problemCategories.${value}` as Key;
    return t.has(key) ? t(key) : value;
  };

  return (
    <div className="flex max-w-content flex-col gap-6">
      <Button asChild variant="ghost" className="self-start">
        <Link href={`/orders?date=${order.businessDate}`}>
          {t("detail.back")}
        </Link>
      </Button>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{t("detail.title", { number })}</h1>
          <Badge status={badgeOf(order.status)}>
            {t(`statuses.${order.status}`)}
          </Badge>
          {order.isVip && <Badge status="neutral">{t("detail.vip")}</Badge>}
        </div>
        <p className="text-small text-text-muted">
          {[
            t("detail.businessDay", { date: businessDay }),
            t("detail.bar", { name: order.barName }),
            order.tableName && t("detail.table", { name: order.tableName }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {order.rejectionReason && (
          <p className="text-body">
            {t("detail.rejectionReason", { reason: order.rejectionReason })}
          </p>
        )}
      </header>

      <OrderActions
        orderId={order.id}
        number={String(number)}
        refundableHuf={order.can.refundableHuf}
        canRefund={order.can.refund}
        canCancel={order.can.cancel}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("detail.items")}>
          <ul className="flex flex-col gap-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex gap-3 text-body">
                <span className="flex-1">
                  <span className="font-semibold tabular-nums">
                    {item.quantity}×
                  </span>{" "}
                  {item.name}
                  {item.options.length > 0 && (
                    <span className="block text-small text-text-muted">
                      {item.options.join(", ")}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {formatHuf(item.lineTotalHuf)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("detail.amounts")}>
          <dl className="flex flex-col gap-2 text-body">
            <Row
              label={t("detail.subtotal")}
              value={formatHuf(a.subtotalHuf)}
            />
            {a.discountHuf > 0 && (
              <Row
                label={t("detail.discount")}
                value={`−${formatHuf(a.discountHuf)}`}
              />
            )}
            <Row
              label={t("detail.serviceFee")}
              value={formatHuf(a.serviceFeeHuf)}
            />
            <Row label={t("detail.tip")} value={formatHuf(a.tipHuf)} />
            <Row
              label={t("detail.total")}
              value={formatHuf(a.totalHuf)}
              strong
            />
            {a.refundedHuf > 0 && (
              <Row
                label={t("detail.refunded")}
                value={`−${formatHuf(a.refundedHuf)}`}
              />
            )}
            <Row
              label={t("detail.platformFee")}
              value={formatHuf(a.platformFeeHuf)}
            />
          </dl>
        </Panel>

        <Panel title={t("detail.payment")}>
          <dl className="flex flex-col gap-2 text-body">
            <Row
              label={t("detail.paymentIntent")}
              value={order.payment?.paymentIntentId ?? t("detail.notGiven")}
              code
            />
            <Row
              label={t("detail.method")}
              value={method ?? t("detail.notGiven")}
            />
            <Row
              label={t("detail.receipt")}
              value={
                order.receipt
                  ? t("detail.receiptBy", {
                      name: order.receipt.by ?? t("detail.unknown"),
                      time: when(order.receipt.at),
                    })
                  : t("detail.receiptMissing")
              }
            />
          </dl>
        </Panel>

        <Panel title={t("detail.guest")}>
          <dl className="flex flex-col gap-2 text-body">
            <Row
              label={t("detail.email")}
              value={order.guest.email ?? t("detail.notGiven")}
            />
            <Row
              label={t("detail.phone")}
              value={order.guest.phone ?? t("detail.notGiven")}
            />
          </dl>
        </Panel>

        <Panel title={t("detail.problems")}>
          {order.problemReports.length === 0 ? (
            <p className="text-body text-text-muted">
              {t("detail.noProblems")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {order.problemReports.map((report, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="text-body font-semibold">
                    {category(report.category)}
                  </span>
                  {report.message && (
                    <span className="text-body break-words">
                      {report.message}
                    </span>
                  )}
                  <span className="text-small text-text-muted">
                    {when(report.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("detail.refunds")}>
          {order.refunds.length === 0 ? (
            <p className="text-body text-text-muted">{t("detail.noRefunds")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {order.refunds.map((refund) => (
                <li key={refund.id} className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-body">
                    <span className="flex-1">
                      {t("detail.refundBy", {
                        amount: formatHuf(refund.amountHuf),
                        who: name(refund.by),
                      })}
                    </span>
                    <Badge status="neutral">
                      {t(`detail.refundStatus.${refund.status}`)}
                    </Badge>
                  </span>
                  <span className="text-body break-words">{refund.reason}</span>
                  <span className="text-small text-text-muted">
                    {when(refund.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t("detail.timeline")}>
        {order.timeline.length === 0 ? (
          <p className="text-body text-text-muted">{t("detail.noTimeline")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {order.timeline.map((entry, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 text-body">
                <span className="min-w-36 shrink-0 text-small text-text-muted tabular-nums">
                  {when(entry.at)}
                </span>
                <span className="font-semibold">
                  {actionLabel(entry.action)}
                </span>
                <span className="text-text-muted">{name(entry.by)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-h3">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  code,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** An identifier (PaymentIntent): small, and may break anywhere so it fits 375px. */
  code?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4">
      <dt className="text-text-muted">{label}</dt>
      <dd
        className={[
          "min-w-0 text-right tabular-nums wrap-anywhere",
          strong && "font-semibold",
          code && "text-small break-all",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
