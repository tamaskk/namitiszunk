import { can } from "@namitiszunk/core/auth";
import {
  getPeriodReport,
  shiftDate,
  venueBusinessDate,
} from "@namitiszunk/core/reports";
import { reportRangeQuerySchema } from "@namitiszunk/validators";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import {
  BreakdownTable,
  Comparison,
  DateFilters,
  Heatmap,
  NoOrders,
  ProductsTable,
  ReportExport,
  ReportsHeader,
  SummaryFigures,
} from "../report-parts";

export const instant = false;

/** The period report (T-061): Owner only; by day, hour, product, bar and QR source, and a comparison. */
export default async function PeriodReportPage({
  searchParams,
}: PageProps<"/reports/period">) {
  const [{ actor, venue }, raw, t] = await Promise.all([
    requireAdminModule("reports"),
    searchParams,
    getTranslations("admin.reports"),
  ]);
  if (!can(actor, "report.viewAll", { venueId: venue.id })) forbidden();

  const given = Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
  const query = reportRangeQuerySchema.safeParse(given);
  // The last 7 business days by default, today included.
  const today = await venueBusinessDate(venue.id);
  const { from, to, cfrom, cto } = query.success
    ? query.data
    : {
        from: shiftDate(today, 6),
        to: today,
        cfrom: undefined,
        cto: undefined,
      };
  const report = await getPeriodReport(
    actor,
    venue.id,
    { from, to },
    cfrom && cto ? { from: cfrom, to: cto } : undefined,
  );

  return (
    <div className="flex max-w-content flex-col gap-6">
      <ReportsHeader active="period" ownerViews />
      <DateFilters
        id="report-period"
        fields={[
          { name: "from", label: t("filters.from"), value: from },
          { name: "to", label: t("filters.to"), value: to },
          { name: "cfrom", label: t("filters.compareFrom"), value: cfrom },
          { name: "cto", label: t("filters.compareTo"), value: cto },
        ]}
        hint={t("filters.compareHint")}
        invalid={
          Object.keys(given).length > 0 && !query.success ? "range" : undefined
        }
      />
      {report.comparison && (
        <Comparison
          current={{ from, to, summary: report.summary }}
          previous={{
            ...report.comparison.range,
            summary: report.comparison.summary,
          }}
        />
      )}
      {report.summary.orders === 0 ? (
        <NoOrders />
      ) : (
        <>
          <SummaryFigures summary={report.summary} />
          <BreakdownTable
            id="report-days"
            title={t("days.title")}
            keyHeader={t("columns.day")}
            rows={report.days}
          />
          <BreakdownTable
            id="report-hours"
            title={t("hours.title")}
            keyHeader={t("columns.hour")}
            rows={report.hours}
          />
          <Heatmap
            cells={report.heatmap}
            hourOrder={report.hours.map((row) => Number(row.key))}
          />
          <ProductsTable products={report.products} />
          <BreakdownTable
            id="report-bars"
            title={t("bars.title")}
            keyHeader={t("columns.bar")}
            rows={report.bars}
          />
          <BreakdownTable
            id="report-qr"
            title={t("qr.title")}
            keyHeader={t("columns.source")}
            rows={report.qrSources}
            hint={t("qr.hint")}
            noneLabel={t("qr.none")}
          />
        </>
      )}
      <ReportExport view="period" from={from} to={to} />
    </div>
  );
}
