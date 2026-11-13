import { can } from "@namitiszunk/core/auth";
import {
  durationText,
  getBartenderReport,
  venueBusinessDate,
} from "@namitiszunk/core/reports";
import { formatHuf } from "@namitiszunk/i18n";
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import { reportRangeQuerySchema } from "@namitiszunk/validators";
import { forbidden } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { DateFilters, ReportExport, ReportsHeader } from "../report-parts";

export const instant = false;

/** The bartender report (T-061): Owner only; from the PIN holders' order actions in the audit log. */
export default async function BartenderReportPage({
  searchParams,
}: PageProps<"/reports/staff">) {
  const [{ actor, venue }, raw, t, format] = await Promise.all([
    requireAdminModule("reports"),
    searchParams,
    getTranslations("admin.reports"),
    getFormatter(),
  ]);
  if (!can(actor, "report.viewAll", { venueId: venue.id })) forbidden();

  const given = {
    from: typeof raw.from === "string" && raw.from ? raw.from : undefined,
    to: typeof raw.to === "string" && raw.to ? raw.to : undefined,
  };
  const query = reportRangeQuerySchema.safeParse(given);
  const today = await venueBusinessDate(venue.id);
  const { from, to } = query.success ? query.data : { from: today, to: today };
  const rows = await getBartenderReport(actor, venue.id, { from, to });

  return (
    <div className="flex max-w-content flex-col gap-6">
      <ReportsHeader active="staff" ownerViews />
      <DateFilters
        id="report-staff"
        fields={[
          { name: "from", label: t("filters.from"), value: from },
          { name: "to", label: t("filters.to"), value: to },
        ]}
        invalid={(given.from ?? given.to) !== undefined && !query.success}
      />
      <p
        role="note"
        className="rounded-lg border border-warning bg-surface p-4 text-body"
      >
        {t("staff.tipNotice")}
      </p>
      <section className="flex flex-col gap-3">
        <h2 id="report-staff-table" className="text-h3">
          {t("staff.title")}
        </h2>
        {rows.length === 0 ? (
          <EmptyState message={t("staff.empty")} />
        ) : (
          <>
            <Table label={t("staff.title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("staff.name")}</TableHead>
                  <TableHead className="text-right">
                    {t("staff.readyOrders")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("staff.perHour")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("staff.prepToReady")}
                  </TableHead>
                  <TableHead className="text-right">{t("staff.tip")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.memberId}>
                    <TableCell>{row.name || t("staff.unknown")}</TableCell>
                    <TableCell className="text-right">
                      {row.readyOrders}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.ordersPerHour === null
                        ? "–"
                        : format.number(row.ordersPerHour, {
                            maximumFractionDigits: 1,
                          })}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.avgPrepToReadySeconds === null
                        ? "–"
                        : t("summary.minutes", {
                            time: durationText(row.avgPrepToReadySeconds),
                          })}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatHuf(row.tipHuf)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-small text-text-muted">{t("staff.hint")}</p>
          </>
        )}
      </section>
      <ReportExport view="staff" from={from} to={to} />
    </div>
  );
}
