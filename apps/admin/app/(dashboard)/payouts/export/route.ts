import { AppError } from "@namitiszunk/core/errors";
import {
  exportBalanceTransactions,
  payoutExportColumns,
  type PayoutExportLabels,
  payoutTransactionTypes,
} from "@namitiszunk/core/payments";
import { adminOrdersExportQuerySchema } from "@namitiszunk/validators";
import { getLocale, getTranslations } from "next-intl/server";

import { contextCanOpen, getAdminContext } from "@/lib/admin-context";

// Up to 100 sequential Stripe pages for a busy 92-day range.
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, message?: string) =>
  new Response(message ?? null, {
    status,
    headers: message
      ? { ...noStore, "Content-Type": "text/plain; charset=utf-8" }
      : noStore,
  });

/** The Payouts export (T-059): the account's Stripe transactions of days from–to, for the accountant. */
export async function GET(request: Request) {
  const context = await getAdminContext();
  if (!contextCanOpen(context, "payouts")) return fail(403);
  // Same range rules as the Orders export: whole days, at most 92.
  const query = adminOrdersExportQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) return fail(400);

  const [t, tErrors, locale] = await Promise.all([
    getTranslations("admin.payouts"),
    getTranslations("apiErrors"),
    getLocale(),
  ]);
  const labels: PayoutExportLabels = {
    locale,
    columns: Object.fromEntries(
      payoutExportColumns.map((column) => [column, t(`columns.${column}`)]),
    ) as PayoutExportLabels["columns"],
    types: Object.fromEntries(
      payoutTransactionTypes.map((type) => [type, t(`types.${type}`)]),
    ),
    filename: t("export.filename"),
    sheet: t("export.sheet"),
  };

  let file;
  try {
    file = await exportBalanceTransactions(
      context.actor,
      context.venue.id,
      query.data,
      labels,
    );
  } catch (error) {
    // The link opens as a page: a refusal the Owner can act on says why in plain text.
    if (error instanceof AppError)
      return fail(
        error.status,
        error.code === "export_too_large"
          ? t("export.tooLarge")
          : error.code === "export_currency_unsupported"
            ? t("export.otherCurrency")
            : error.code === "rate_limited" ||
                error.code === "stripe_account_missing"
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
