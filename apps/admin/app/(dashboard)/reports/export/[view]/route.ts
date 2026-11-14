import { AppError } from "@namitiszunk/core/errors";
import {
  dailyExportColumns,
  exportReport,
  periodExportColumns,
  periodSections,
  type ReportExportColumn,
  type ReportExportLabels,
  type ReportView,
  reportViews,
  staffExportColumns,
} from "@namitiszunk/core/reports";
import { adminOrdersExportQuerySchema } from "@namitiszunk/validators";
import { getLocale, getTranslations } from "next-intl/server";

import { contextCanOpen, getAdminContext } from "@/lib/admin-context";

const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, message?: string) =>
  new Response(message ?? null, {
    status,
    headers: message
      ? { ...noStore, "Content-Type": "text/plain; charset=utf-8" }
      : noStore,
  });

const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const columns: ReportExportColumn[] = [
  ...new Set([
    ...dailyExportColumns,
    ...periodExportColumns,
    ...staffExportColumns,
  ]),
];

/** A report view's export (T-061): business days from–to as CSV or Excel, titles in the user's language. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/reports/export/[view]">,
) {
  const context = await getAdminContext();
  if (!contextCanOpen(context, "reports")) return fail(403);
  const { view } = await params;
  const query = adminOrdersExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!reportViews.includes(view as ReportView) || !query.success)
    return fail(400);
  const reportView = view as ReportView;

  const [t, tErrors, locale] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("apiErrors"),
    getLocale(),
  ]);
  const labels: ReportExportLabels = {
    columns: Object.fromEntries(
      columns.map((column) => [column, t(`export.columns.${column}`)]),
    ) as ReportExportLabels["columns"],
    sections: Object.fromEntries(
      periodSections.map((section) => [
        section,
        t(`export.sections.${section}`),
      ]),
    ) as ReportExportLabels["sections"],
    weekdays: weekdays.map((day) => t(`heatmap.weekdays.${day}`)),
    noQr: t("qr.none"),
    english: locale === "en",
    filename: t(`export.files.${reportView}`),
    sheet: t(`export.sheets.${reportView}`),
  };

  let file;
  try {
    file = await exportReport(
      context.actor,
      context.venue.id,
      reportView,
      query.data,
      labels,
    );
  } catch (error) {
    // The button shows a refusal the user can act on in plain text.
    if (error instanceof AppError)
      return fail(
        error.status,
        error.code === "rate_limited" ? tErrors(error.code) : undefined,
      );
    throw error;
  }
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
