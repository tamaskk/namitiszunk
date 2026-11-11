import { AppError } from "@namitiszunk/core/errors";
import {
  exportColumns,
  type ExportLabels,
  exportVenueOrders,
} from "@namitiszunk/core/orders/admin";
import {
  adminOrdersExportQuerySchema,
  orderStatuses,
  paymentMethodFilters,
} from "@namitiszunk/validators";
import { getTranslations } from "next-intl/server";

import { contextCanOpen, getAdminContext } from "@/lib/admin-context";

const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, message?: string) =>
  new Response(message ?? null, {
    status,
    headers: message
      ? { ...noStore, "Content-Type": "text/plain; charset=utf-8" }
      : noStore,
  });

/** The Orders export (T-056): business days from–to as CSV or Excel, column titles in the user's language. */
export async function GET(request: Request) {
  const context = await getAdminContext();
  if (!contextCanOpen(context, "orders")) return fail(403);
  const query = adminOrdersExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) return fail(400);

  const [t, tErrors] = await Promise.all([
    getTranslations("admin.orders"),
    getTranslations("apiErrors"),
  ]);
  const labels: ExportLabels = {
    columns: Object.fromEntries(
      exportColumns.map((column) => [column, t(`columns.${column}`)]),
    ) as ExportLabels["columns"],
    status: Object.fromEntries(
      orderStatuses.map((status) => [status, t(`statuses.${status}`)]),
    ) as ExportLabels["status"],
    methods: Object.fromEntries(
      paymentMethodFilters.map((method) => [
        method,
        t(`filters.methods.${method}`),
      ]),
    ),
    filename: t("export.filename"),
    sheet: t("export.sheet"),
  };

  let file;
  try {
    file = await exportVenueOrders(
      context.actor,
      context.venue.id,
      query.data,
      labels,
    );
  } catch (error) {
    // The link opens as a page: a refusal the manager can act on says why in plain text.
    if (error instanceof AppError)
      return fail(
        error.status,
        error.code === "export_too_large" || error.code === "rate_limited"
          ? tErrors(error.code)
          : undefined,
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
