import "server-only";

import { hitRateLimit, type RateLimitRule } from "../api/rate-limit";
import { auditActorOf } from "../audit/audit";
import { type Actor, can, requirePermission } from "../auth/permissions";
import { AppError } from "../errors";
import { type TableFile, writeTableFile } from "../export/table-file";
import {
  barBreakdown,
  bartenderStats,
  type BartenderRow,
  type BreakdownRow,
  dailyBreakdown,
  type DayRange,
  durationText,
  type HeatCell,
  heatmap,
  hourlyBreakdown,
  type ProductRow,
  qrSourceBreakdown,
  type ReportSummary,
  summarizeByDay,
  summarizeOrders,
  topProducts,
  venueBusinessDate,
} from "./aggregations";

// The Reports module (T-061): Manager and Owner see the daily report, only the Owner the
// period and bartender reports (permissions.ts: report.viewDaily, report.viewAll).

export type DailyReport = {
  businessDate: string;
  summary: ReportSummary;
  hours: BreakdownRow[];
  products: ProductRow[];
};

export type PeriodReport = {
  range: DayRange;
  summary: ReportSummary;
  days: BreakdownRow[];
  hours: BreakdownRow[];
  products: ProductRow[];
  bars: BreakdownRow[];
  qrSources: BreakdownRow[];
  heatmap: HeatCell[];
  /** The second period, when one was chosen. */
  comparison: { range: DayRange; summary: ReportSummary } | null;
};

/** One business day; the venue's current one when `date` is unset. */
export async function getDailyReport(
  actor: Actor,
  venueId: string,
  date?: string,
  now = new Date(),
): Promise<DailyReport> {
  requirePermission(actor, "report.viewDaily", { venueId });
  const day = date ?? (await venueBusinessDate(venueId, now));
  const range = { from: day, to: day };
  const [summary, hours, products] = await Promise.all([
    summarizeOrders(venueId, range),
    hourlyBreakdown(venueId, range),
    topProducts(venueId, range),
  ]);
  return { businessDate: day, summary, hours, products };
}

export async function getPeriodReport(
  actor: Actor,
  venueId: string,
  range: DayRange,
  compareWith?: DayRange,
): Promise<PeriodReport> {
  requirePermission(actor, "report.viewAll", { venueId });
  const [summary, days, hours, products, bars, qrSources, cells, previous] =
    await Promise.all([
      summarizeOrders(venueId, range),
      dailyBreakdown(venueId, range),
      hourlyBreakdown(venueId, range),
      topProducts(venueId, range),
      barBreakdown(venueId, range),
      qrSourceBreakdown(venueId, range),
      heatmap(venueId, range),
      compareWith ? summarizeOrders(venueId, compareWith) : null,
    ]);
  return {
    range,
    summary,
    days,
    hours,
    products,
    bars,
    qrSources,
    heatmap: cells,
    comparison:
      compareWith && previous
        ? { range: compareWith, summary: previous }
        : null,
  };
}

export async function getBartenderReport(
  actor: Actor,
  venueId: string,
  range: DayRange,
): Promise<BartenderRow[]> {
  requirePermission(actor, "report.viewAll", { venueId });
  return bartenderStats(venueId, range);
}

export const reportViews = ["daily", "period", "staff"] as const;
export type ReportView = (typeof reportViews)[number];

export const dailyExportColumns = [
  "businessDate",
  "orders",
  "revenueHuf",
  "tipHuf",
  "avgBasketHuf",
  "avgPrep",
  "medianPrep",
  "avgPickup",
  "refundedOrders",
  "refundedHuf",
  "expiredOrders",
] as const;
export const periodExportColumns = [
  "section",
  "label",
  "orders",
  "items",
  "revenueHuf",
  "tipHuf",
] as const;
export const staffExportColumns = [
  "name",
  "readyOrders",
  "ordersPerHour",
  "avgPrepToReady",
  "tipHuf",
] as const;
export type ReportExportColumn =
  | (typeof dailyExportColumns)[number]
  | (typeof periodExportColumns)[number]
  | (typeof staffExportColumns)[number];

export const periodSections = [
  "day",
  "hour",
  "heatmap",
  "product",
  "bar",
  "qr",
] as const;
export type PeriodSection = (typeof periodSections)[number];

export type ReportExportLabels = {
  columns: Record<ReportExportColumn, string>;
  sections: Record<PeriodSection, string>;
  /** Monday first. */
  weekdays: readonly string[];
  /** Label of orders without a QR source. */
  noQr: string;
  /** Product names in English where the order stored one. */
  english: boolean;
  /** File name before the dates, and the Excel sheet's name. */
  filename: string;
  sheet: string;
};

const EXPORT_RATE: RateLimitRule = { limit: 10, windowSeconds: 60 };

/**
 * A report view as CSV or Excel for business days `from`–`to`: the daily figures one row per
 * day, the period breakdowns one row per group, or the bartender table. Whole forints.
 */
export async function exportReport(
  actor: Actor,
  venueId: string,
  view: ReportView,
  range: DayRange & { format: "csv" | "xlsx" },
  labels: ReportExportLabels,
): Promise<TableFile> {
  requirePermission(
    actor,
    view === "daily" ? "report.viewDaily" : "report.viewAll",
    { venueId },
  );
  // A Manager sees one business day at a time; a range of days is the Owner's period report (spec 61).
  if (
    view === "daily" &&
    range.from !== range.to &&
    !can(actor, "report.viewAll", { venueId })
  )
    throw new AppError(403, "forbidden");
  if (
    await hitRateLimit(
      `reports-export:${JSON.stringify(auditActorOf(actor))}`,
      EXPORT_RATE,
    )
  )
    throw new AppError(429, "rate_limited");

  let columns: readonly ReportExportColumn[];
  let rows: (string | number)[][];
  if (view === "daily") {
    columns = dailyExportColumns;
    rows = (await summarizeByDay(venueId, range)).map((day) => [
      day.businessDate,
      day.orders,
      day.revenueHuf,
      day.tipHuf,
      day.avgBasketHuf,
      durationText(day.avgPrepSeconds),
      durationText(day.medianPrepSeconds),
      durationText(day.avgPickupSeconds),
      day.refundedOrders,
      day.refundedHuf,
      day.expiredOrders,
    ]);
  } else if (view === "staff") {
    columns = staffExportColumns;
    rows = (await bartenderStats(venueId, range)).map((row) => [
      row.name,
      row.readyOrders,
      row.ordersPerHour ?? "",
      durationText(row.avgPrepToReadySeconds),
      row.tipHuf,
    ]);
  } else {
    columns = periodExportColumns;
    const [days, hours, cells, products, bars, qrSources] = await Promise.all([
      dailyBreakdown(venueId, range),
      hourlyBreakdown(venueId, range),
      heatmap(venueId, range),
      topProducts(venueId, range, 1000),
      barBreakdown(venueId, range),
      qrSourceBreakdown(venueId, range),
    ]);
    const group = (section: PeriodSection, list: BreakdownRow[]) =>
      list.map((row) => [
        labels.sections[section],
        section === "qr" && row.key === "none" ? labels.noQr : row.label,
        row.orders,
        row.items,
        row.revenueHuf,
        row.tipHuf,
      ]);
    rows = [
      ...group("day", days),
      ...group("hour", hours),
      ...cells.map((cell) => [
        labels.sections.heatmap,
        `${labels.weekdays[cell.weekday - 1]} ${String(cell.hour).padStart(2, "0")}:00`,
        cell.orders,
        "",
        "",
        "",
      ]),
      ...products.map((p) => [
        labels.sections.product,
        (labels.english && p.nameEn) || p.name,
        p.orders,
        p.quantity,
        p.revenueHuf,
        "",
      ]),
      ...group("bar", bars),
      ...group("qr", qrSources),
    ];
  }
  return writeTableFile({
    header: columns.map((column) => labels.columns[column]),
    rows,
    hufColumns: columns.map((column) => column.endsWith("Huf")),
    format: range.format,
    filename: `${labels.filename}-${range.from}_${range.to}`,
    sheet: labels.sheet,
  });
}
