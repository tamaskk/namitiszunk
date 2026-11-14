import { durationText, getDashboard } from "@namitiszunk/core/reports";
import {
  buttonVariants,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { DashboardBars } from "./dashboard-bars";
import { DashboardLive } from "./dashboard-live";
import { SummaryFigures } from "@/app/(dashboard)/reports/report-parts";
import { SoldOutButton } from "./sold-out-button";

export const instant = false;

/** The Manager's live view of tonight (T-063): figures, bar load, quick actions and warnings. */
export default async function DashboardPage() {
  const [{ actor, venue }, t, tReports, format, locale] = await Promise.all([
    requireAdminModule("dashboard"),
    getTranslations("admin.dashboard"),
    getTranslations("admin.reports.summary"),
    getFormatter(),
    getLocale(),
  ]);
  const d = await getDashboard(actor, venue.id);
  const name = (item: { name: string; nameEn?: string }) =>
    (locale === "en" && item.nameEn) || item.name;
  const time = (iso: string | Date) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
  const { warnings } = d;
  const hasWarnings =
    warnings.pausedSince !== null ||
    warnings.expiredOrders > 0 ||
    warnings.missingReceipts > 0;

  return (
    <div className="flex max-w-content flex-col gap-6">
      <DashboardLive venueId={venue.id} channels={d.channels} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t("title")}</h1>
          <p className="text-small text-text-muted">
            {t("today", {
              // Noon UTC is the same calendar day in Budapest.
              date: format.dateTime(new Date(`${d.businessDate}T12:00:00Z`), {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }),
            })}
          </p>
        </div>
        <Link
          href="/pult"
          className={buttonVariants({
            variant: "secondary",
            className: "ml-auto",
          })}
        >
          {t("openBarView")}
        </Link>
      </div>

      <section
        aria-labelledby="dashboard-warnings"
        className="flex flex-col gap-3"
      >
        <h2 id="dashboard-warnings" className="text-h3">
          {t("warnings.title")}
        </h2>
        {hasWarnings ? (
          <ul className="flex flex-col gap-2">
            {warnings.pausedSince && (
              <li className="rounded-lg border border-warning px-4 py-3 text-body text-warning">
                {t("warnings.pausedSince", {
                  time: time(warnings.pausedSince),
                })}
              </li>
            )}
            {warnings.expiredOrders > 0 && (
              <Warning
                text={t("warnings.expired", { count: warnings.expiredOrders })}
                href={`/orders?date=${d.businessDate}&status=expired`}
                action={t("warnings.showOrders")}
              />
            )}
            {warnings.missingReceipts > 0 && (
              <Warning
                text={t("warnings.missingReceipts", {
                  count: warnings.missingReceipts,
                })}
                href={`/orders?date=${d.businessDate}&receipt=missing`}
                action={t("warnings.showOrders")}
              />
            )}
          </ul>
        ) : (
          <p className="text-body text-text-muted">{t("warnings.none")}</p>
        )}
      </section>

      <SummaryFigures summary={d.summary} />

      <DashboardBars bars={d.bars} canPause={d.can.pauseBars} />

      <section className="flex flex-col gap-3">
        <h2 id="dashboard-trend" className="text-h3">
          {t("trend.title")}
        </h2>
        {d.trend.every((bucket) => bucket.orders === 0) ? (
          <p className="text-body text-text-muted">{t("trend.empty")}</p>
        ) : (
          <Table label={t("trend.title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("trend.time")}</TableHead>
                <TableHead className="text-right">
                  {t("trend.orders")}
                </TableHead>
                <TableHead className="text-right">{t("trend.wait")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.trend.map((bucket) => (
                <TableRow key={bucket.start.toISOString()}>
                  <TableCell>{time(bucket.start)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {bucket.orders}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {bucket.avgWaitSeconds === null
                      ? t("trend.none")
                      : tReports("minutes", {
                          time: durationText(bucket.avgWaitSeconds),
                        })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section
        aria-labelledby="dashboard-products"
        className="flex flex-col gap-3"
      >
        <h2 id="dashboard-products" className="text-h3">
          {t("products.title")}
        </h2>
        {d.products.length === 0 ? (
          <p className="text-body text-text-muted">{t("products.empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {d.products.map((product) => (
              <li
                key={product.itemId}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-medium">{name(product)}</span>
                  <span className="text-small text-text-muted">
                    {t("products.quantity", { count: product.quantity })}
                    {!product.isAvailable && ` · ${t("products.soldOut")}`}
                  </span>
                </span>
                {d.can.setSoldOut && (
                  <SoldOutButton
                    itemId={product.itemId}
                    itemName={name(product)}
                    available={product.isAvailable}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="dashboard-sold-out"
        className="flex flex-col gap-3"
      >
        <h2 id="dashboard-sold-out" className="text-h3">
          {t("soldOut.title")}
        </h2>
        {d.soldOut.length === 0 ? (
          <p className="text-body text-text-muted">{t("soldOut.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {d.soldOut.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-body">{name(item)}</span>
                {d.can.setSoldOut && (
                  <SoldOutButton
                    itemId={item.id}
                    itemName={name(item)}
                    available={false}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Warning({
  text,
  href,
  action,
}: {
  text: string;
  href: string;
  action: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-warning px-4 py-3">
      <span className="min-w-0 flex-1 text-body text-warning">{text}</span>
      <Link href={href} className={buttonVariants({ variant: "secondary" })}>
        {action}
      </Link>
    </li>
  );
}
