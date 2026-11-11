import { listVenueOrders } from "@namitiszunk/core/orders/admin";
import { formatHuf } from "@namitiszunk/i18n";
import { Badge, Button, EmptyState } from "@namitiszunk/ui";
import { adminOrdersQuerySchema } from "@namitiszunk/validators";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { OrdersFilters } from "./orders-filters";
import { badgeOf } from "./status-badge";

export const instant = false;

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The Orders module (T-056): one business day's paid orders, filters, and the export. */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { actor, venue } = await requireAdminModule("orders");
  const raw = Object.fromEntries(
    Object.entries(await searchParams).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
  // A hand-edited query falls back to today's unfiltered list instead of an error page.
  const parsed = adminOrdersQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : {};
  const [page, t, format] = await Promise.all([
    listVenueOrders(actor, venue.id, {
      date: query.date,
      number: query.number,
      status: query.status,
      barId: query.bar,
      minHuf: query.min,
      maxHuf: query.max,
      method: query.method,
      problem: query.problem === "1",
      missingReceipt: query.receipt === "missing",
      page: query.page,
    }),
    getTranslations("admin"),
    getFormatter(),
  ]);
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const pageHref = (n: number) =>
    `/orders?${new URLSearchParams({ ...raw, page: String(n) })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t("nav.orders")}</h1>
      <OrdersFilters
        bars={page.bars}
        initial={{
          date: page.businessDate,
          number: raw.number ?? "",
          status: query.status ?? "any",
          bar: query.bar ?? "any",
          min: raw.min ?? "",
          max: raw.max ?? "",
          method: query.method ?? "any",
          problem: query.problem === "1",
          missingReceipt: query.receipt === "missing",
        }}
      />

      <section aria-labelledby="orders-list" className="flex flex-col gap-3">
        <h2 id="orders-list" className="text-h3">
          {t("orders.list.count", { count: page.total })}
        </h2>
        {page.orders.length === 0 ? (
          <EmptyState message={t("orders.list.empty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {page.orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4 hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <span className="text-h3 tabular-nums">
                    {t("orders.list.open", {
                      number: order.shortNumber ?? t("orders.list.noNumber"),
                    })}
                  </span>
                  <span className="text-small text-text-muted">
                    {format.dateTime(order.paidAt, { timeStyle: "short" })}
                    {" · "}
                    {order.barName}
                  </span>
                  <span className="flex flex-1 flex-wrap justify-end gap-2">
                    {order.problemCount > 0 && (
                      <Badge status="neutral">
                        {t("orders.list.problems", {
                          count: order.problemCount,
                        })}
                      </Badge>
                    )}
                    {!order.receiptEntered && (
                      <Badge status="neutral">
                        {t("orders.list.noReceipt")}
                      </Badge>
                    )}
                    <Badge status={badgeOf(order.status)}>
                      {t(`orders.statuses.${order.status}`)}
                    </Badge>
                  </span>
                  <span className="w-full text-right text-body tabular-nums sm:w-auto">
                    {formatHuf(order.totalHuf)}
                    {order.refundedHuf > 0 && (
                      <span className="block text-small text-text-muted">
                        {t("orders.list.refunded", {
                          amount: formatHuf(order.refundedHuf),
                        })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav
            aria-label={t("orders.list.pagination")}
            className="flex items-center justify-between gap-3"
          >
            {page.page > 1 ? (
              <Button asChild variant="secondary">
                <Link href={pageHref(page.page - 1)}>
                  {t("orders.list.previous")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-small text-text-muted">
              {t("orders.list.page", { page: page.page, pages })}
            </span>
            {page.page < pages ? (
              <Button asChild variant="secondary">
                <Link href={pageHref(page.page + 1)}>
                  {t("orders.list.next")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
