import { can } from "@namitiszunk/core/auth";
import { getDailyReport } from "@namitiszunk/core/reports";
import { reportDayQuerySchema } from "@namitiszunk/validators";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import {
  BreakdownTable,
  DateFilters,
  NoOrders,
  ProductsTable,
  ReportExport,
  ReportsHeader,
  SummaryFigures,
} from "./report-parts";

export const instant = false;

/** The daily report (T-061): Manager and Owner, one business day of the venue. */
export default async function DailyReportPage({
  searchParams,
}: PageProps<"/reports">) {
  const [{ actor, venue }, raw, t] = await Promise.all([
    requireAdminModule("reports"),
    searchParams,
    getTranslations("admin.reports"),
  ]);
  const query = reportDayQuerySchema.safeParse({
    date: typeof raw.date === "string" && raw.date ? raw.date : undefined,
  });
  const report = await getDailyReport(
    actor,
    venue.id,
    query.success ? query.data.date : undefined,
  );
  const day = report.businessDate;

  return (
    <div className="flex max-w-content flex-col gap-6">
      <ReportsHeader
        active="daily"
        ownerViews={can(actor, "report.viewAll", { venueId: venue.id })}
      />
      <DateFilters
        id="report-day"
        fields={[{ name: "date", label: t("filters.date"), value: day }]}
        invalid={!query.success}
      />
      {report.summary.orders === 0 ? (
        <NoOrders />
      ) : (
        <>
          <SummaryFigures summary={report.summary} />
          <BreakdownTable
            id="report-hours"
            title={t("hours.title")}
            keyHeader={t("columns.hour")}
            rows={report.hours}
          />
          <ProductsTable products={report.products} />
        </>
      )}
      <ReportExport view="daily" from={day} to={day} />
    </div>
  );
}
