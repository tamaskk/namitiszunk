import {
  type BreakdownRow,
  durationText,
  type HeatCell,
  percentChange,
  type ProductRow,
  type ReportSummary,
  type ReportView,
} from "@namitiszunk/core/reports";
import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  buttonVariants,
  cn,
  EmptyState,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ExportRange } from "@/components/export-range";

// Server-rendered building blocks of the Reports module (T-061): no client JS but the export.

const views = [
  { view: "daily", href: "/reports" },
  { view: "period", href: "/reports/period" },
  { view: "staff", href: "/reports/staff" },
] as const;

/** The module heading and the view links; the Owner's views only for the Owner. */
export async function ReportsHeader({
  active,
  ownerViews,
}: {
  active: ReportView;
  ownerViews: boolean;
}) {
  const [t, tNav] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin.nav"),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{tNav("reports")}</h1>
        <p className="text-small text-text-muted">{t("intro")}</p>
      </div>
      {ownerViews && (
        <nav aria-label={t("tabs.label")} className="flex flex-wrap gap-2">
          {views.map(({ view, href }) => (
            <Link
              key={view}
              href={href}
              aria-current={view === active ? "page" : undefined}
              className={buttonVariants({
                variant: view === active ? "secondary" : "ghost",
                className: view === active ? "ring-1 ring-primary" : undefined,
              })}
            >
              {t(`tabs.${view}`)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export type DateField = { name: string; label: string; value?: string };

/** A GET form of business-day fields: the filters live in the URL, so a view can be shared. */
export async function DateFilters({
  id,
  fields,
  hint,
  invalid,
}: {
  id: string;
  fields: DateField[];
  hint?: string;
  /** The query did not parse and the defaults are shown. */
  invalid?: boolean;
}) {
  const t = await getTranslations("admin.reports.filters");
  return (
    <form
      method="get"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={`${id}-${field.name}`}>{field.label}</Label>
            <Input
              id={`${id}-${field.name}`}
              name={field.name}
              type="date"
              defaultValue={field.value}
            />
          </div>
        ))}
      </div>
      {hint && <p className="text-small text-text-muted">{hint}</p>}
      {invalid && (
        <p role="alert" className="text-small text-danger">
          {t("invalid")}
        </p>
      )}
      <Button type="submit" variant="secondary" className="self-start">
        {t("show")}
      </Button>
    </form>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="text-h3 tabular-nums">{value}</dd>
    </div>
  );
}

/** The headline figures as cards. */
export async function SummaryFigures({ summary }: { summary: ReportSummary }) {
  const t = await getTranslations("admin.reports.summary");
  const time = (s: number | null) =>
    s === null ? t("none") : t("minutes", { time: durationText(s) });
  return (
    <section aria-labelledby="report-summary" className="flex flex-col gap-3">
      <h2 id="report-summary" className="text-h3">
        {t("title")}
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={t("orders")} value={String(summary.orders)} />
        <Figure label={t("revenue")} value={formatHuf(summary.revenueHuf)} />
        <Figure label={t("tip")} value={formatHuf(summary.tipHuf)} />
        <Figure
          label={t("avgBasket")}
          value={formatHuf(summary.avgBasketHuf)}
        />
        <Figure label={t("avgPrep")} value={time(summary.avgPrepSeconds)} />
        <Figure
          label={t("medianPrep")}
          value={time(summary.medianPrepSeconds)}
        />
        <Figure label={t("avgPickup")} value={time(summary.avgPickupSeconds)} />
        <Figure
          label={t("refunds")}
          value={t("refundsValue", {
            amount: formatHuf(summary.refundedHuf),
            count: summary.refundedOrders,
          })}
        />
        <Figure label={t("expired")} value={String(summary.expiredOrders)} />
      </dl>
      <p className="text-small text-text-muted">{t("hint")}</p>
    </section>
  );
}

/** Orders, items, revenue and tips per group (hour, day, bar, QR source). */
export async function BreakdownTable({
  id,
  title,
  keyHeader,
  rows,
  hint,
  noneLabel,
}: {
  id: string;
  title: string;
  keyHeader: string;
  rows: BreakdownRow[];
  hint?: string;
  /** The label of the "none" key (orders without a QR source). */
  noneLabel?: string;
}) {
  const t = await getTranslations("admin.reports.columns");
  return (
    <section className="flex flex-col gap-3">
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      {hint && <p className="text-small text-text-muted">{hint}</p>}
      <Table label={title}>
        <TableHeader>
          <TableRow>
            <TableHead>{keyHeader}</TableHead>
            <TableHead className="text-right">{t("orders")}</TableHead>
            <TableHead className="text-right">{t("items")}</TableHead>
            <TableHead className="text-right">{t("revenue")}</TableHead>
            <TableHead className="text-right">{t("tip")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                {row.key === "none" && noneLabel ? noneLabel : row.label}
              </TableCell>
              <TableCell className="text-right">{row.orders}</TableCell>
              <TableCell className="text-right">{row.items}</TableCell>
              <TableCell className="text-right">
                {formatHuf(row.revenueHuf)}
              </TableCell>
              <TableCell className="text-right">
                {formatHuf(row.tipHuf)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export async function ProductsTable({ products }: { products: ProductRow[] }) {
  const [t, locale] = await Promise.all([
    getTranslations("admin.reports"),
    getLocale(),
  ]);
  return (
    <section className="flex flex-col gap-3">
      <h2 id="report-products" className="text-h3">
        {t("products.title")}
      </h2>
      <Table label={t("products.title")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.product")}</TableHead>
            <TableHead className="text-right">
              {t("columns.quantity")}
            </TableHead>
            <TableHead className="text-right">{t("columns.orders")}</TableHead>
            <TableHead className="text-right">{t("columns.revenue")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.itemId}>
              <TableCell>
                {(locale === "en" && product.nameEn) || product.name}
              </TableCell>
              <TableCell className="text-right">{product.quantity}</TableCell>
              <TableCell className="text-right">{product.orders}</TableCell>
              <TableCell className="text-right">
                {formatHuf(product.revenueHuf)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Weekday × hour: each cell mixes the accent into the surface in four steps of the busiest cell.
 * Only the hours with orders are columns, in the order of the night.
 */
export async function Heatmap({
  cells,
  hourOrder,
}: {
  cells: HeatCell[];
  /** Hours as the hourly breakdown lists them (night order). */
  hourOrder: number[];
}) {
  const t = await getTranslations("admin.reports.heatmap");
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const count = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c.orders]));
  const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <section className="flex flex-col gap-3">
      <h2 id="report-heatmap" className="text-h3">
        {t("title")}
      </h2>
      <p className="text-small text-text-muted">{t("hint")}</p>
      <Table label={t("title")} className="border-separate border-spacing-1">
        <TableHeader>
          <TableRow className="border-0">
            <TableHead className="px-1">
              <span className="sr-only">{t("title")}</span>
            </TableHead>
            {hourOrder.map((h) => (
              <TableHead key={h} className="px-1 text-center">
                {hour(h)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {weekdayKeys.map((key, index) => {
            const day = t(`weekdays.${key}`);
            return (
              <TableRow key={key} className="border-0 hover:bg-transparent">
                <TableHead scope="row" className="px-1">
                  {day}
                </TableHead>
                {hourOrder.map((h) => {
                  const orders = count.get(`${index + 1}-${h}`) ?? 0;
                  // Four steps: from 50% on, dark text keeps AA contrast on the lighter mix.
                  const share = Math.ceil((orders / max) * 4) * 25;
                  return (
                    <TableCell
                      key={h}
                      title={t("cell", { day, hour: hour(h), count: orders })}
                      className={cn(
                        "rounded-sm px-1 text-center",
                        share >= 50 ? "text-on-primary" : "text-text",
                      )}
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--color-primary) ${share}%, var(--color-surface))`,
                      }}
                    >
                      {orders}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

/** The current and a second period's headline figures side by side, with the change in percent. */
export async function Comparison({
  current,
  previous,
}: {
  current: { from: string; to: string; summary: ReportSummary };
  previous: { from: string; to: string; summary: ReportSummary };
}) {
  const t = await getTranslations("admin.reports");
  const rows = [
    ["orders", (s: ReportSummary) => s.orders, String],
    ["revenue", (s: ReportSummary) => s.revenueHuf, formatHuf],
    ["tip", (s: ReportSummary) => s.tipHuf, formatHuf],
    ["avgBasket", (s: ReportSummary) => s.avgBasketHuf, formatHuf],
    [
      "avgPrep",
      (s: ReportSummary) => s.avgPrepSeconds ?? 0,
      (n: number) => t("summary.minutes", { time: durationText(n) }),
    ],
  ] as const;
  return (
    <section className="flex flex-col gap-3">
      <h2 id="report-compare" className="text-h3">
        {t("compare.title")}
      </h2>
      <Table label={t("compare.title")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("compare.metric")}</TableHead>
            {[current, previous].map((p) => (
              <TableHead key={`${p.from}-${p.to}`} className="text-right">
                {t("compare.current", { from: p.from, to: p.to })}
              </TableHead>
            ))}
            <TableHead className="text-right">{t("compare.change")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([key, pick, show]) => {
            const change = percentChange(
              pick(current.summary),
              pick(previous.summary),
            );
            return (
              <TableRow key={key}>
                <TableCell>{t(`summary.${key}`)}</TableCell>
                <TableCell className="text-right">
                  {show(pick(current.summary))}
                </TableCell>
                <TableCell className="text-right">
                  {show(pick(previous.summary))}
                </TableCell>
                <TableCell className="text-right">
                  {change === null ? "–" : `${change > 0 ? "+" : ""}${change}%`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export async function NoOrders() {
  const t = await getTranslations("admin.reports");
  return <EmptyState message={t("empty")} />;
}

/** CSV and Excel of one view, for a range that starts as the one on screen. */
export async function ReportExport({
  view,
  from,
  to,
}: {
  view: ReportView;
  from: string;
  to: string;
}) {
  const [t, tErrors] = await Promise.all([
    getTranslations("admin.reports.export"),
    getTranslations("apiErrors"),
  ]);
  return (
    <ExportRange
      // A new filter keeps this component; the key resets its fields to the range on screen.
      key={`${from}_${to}`}
      id={`report-export-${view}`}
      path={`/reports/export/${view}`}
      initialDate={from}
      initialTo={to}
      labels={{
        title: t("title"),
        from: t("from"),
        to: t("to"),
        hint: t("hint"),
        invalidRange: t("invalidRange"),
        csv: t("csv"),
        xlsx: t("xlsx"),
        failed: tErrors("internal"),
      }}
    />
  );
}
