import { getGuestConfirmation } from "@namitiszunk/core/orders";
import { formatDateTime, formatHuf, type Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { loadForGuest } from "@/lib/guest-data";

import { OrderLoading } from "../../o/[orderId]/order-loading";
import { ConfirmationActions } from "./confirmation-actions";

// The guest token is in the URL: never send it on as a Referer, never index the page.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The payment confirmation (T-044): /r/[orderId]?t=[guest token]. Not a receipt, and says so first.
export default function ConfirmationPage(
  props: PageProps<"/[locale]/r/[orderId]">,
) {
  return (
    <Suspense fallback={<OrderLoading />}>
      <Confirmation {...props} />
    </Suspense>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-body">
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

async function Confirmation({
  params,
  searchParams,
}: PageProps<"/[locale]/r/[orderId]">) {
  const { locale, orderId } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale as Locale);
  const c = await loadForGuest(orderId, token, (actor) =>
    getGuestConfirmation(actor, orderId),
  );
  if (!c) notFound();
  const t = await getTranslations("order.confirmation");
  const at = (date: Date) => formatDateTime(date, locale);

  const wallet = c.method?.wallet;
  const method = !c.method
    ? t("methodUnknown")
    : wallet
      ? t(
          `wallet.${wallet === "apple_pay" || wallet === "google_pay" ? wallet : "other"}`,
        )
      : c.method.brand && c.method.last4
        ? t("methodCard", {
            brand: capitalize(c.method.brand),
            last4: c.method.last4,
          })
        : c.method.brand
          ? t("methodCardOnly", { brand: capitalize(c.method.brand) })
          : t("methodUnknown");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-8 px-4 py-6">
      {/* First line on screen and on paper (T-044): this is never mistaken for a receipt. */}
      <p
        role="note"
        className="rounded-md border border-warning p-4 text-body font-semibold text-warning"
      >
        {t("notReceipt")}
      </p>

      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-body text-text-muted">
          {t("number")}: <span className="tabular-nums">{c.number}</span>
        </p>
        <p className="text-body text-text-muted">
          {t("orderedAt")}: {at(c.createdAt)}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-h3 mb-4">{t("items")}</h2>
        <ul className="flex flex-col gap-3">
          {c.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-4 text-body">
              <span>
                {item.quantity} ×{" "}
                {locale === "en" && item.nameEn ? item.nameEn : item.name}
                {item.options.length > 0 && (
                  <span className="block text-small text-text-muted">
                    {item.options.join(", ")}
                  </span>
                )}
              </span>
              <span className="tabular-nums">
                {formatHuf(item.lineTotalHuf)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <Row label={t("subtotal")}>{formatHuf(c.subtotalHuf)}</Row>
          {c.discountHuf > 0 && (
            <Row label={t("discount")}>−{formatHuf(c.discountHuf)}</Row>
          )}
          {c.serviceFeeHuf > 0 && (
            <Row label={t("serviceFee")}>{formatHuf(c.serviceFeeHuf)}</Row>
          )}
          {c.tipHuf > 0 && <Row label={t("tip")}>{formatHuf(c.tipHuf)}</Row>}
          <div className="flex justify-between gap-4 text-body font-semibold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{formatHuf(c.totalHuf)}</dd>
          </div>
        </dl>
      </section>

      <dl className="flex flex-col gap-2">
        <Row label={t("paidAt")}>{at(c.paidAt)}</Row>
        <Row label={t("method")}>{method}</Row>
        {c.refunds.map((r, i) => (
          <Row key={i} label={t("refunds")}>
            {t("refundLine", {
              amount: formatHuf(r.amountHuf),
              date: at(r.at),
            })}
          </Row>
        ))}
      </dl>

      <section className="flex flex-col gap-1 text-body">
        <h2 className="text-label text-text-muted uppercase">{t("venue")}</h2>
        <p>{c.venue.name}</p>
        {c.venue.companyName && <p>{c.venue.companyName}</p>}
        {c.venue.address && <p>{c.venue.address}</p>}
        {c.venue.taxNumber && (
          <p>{t("taxNumber", { taxNumber: c.venue.taxNumber })}</p>
        )}
      </section>

      <ConfirmationActions
        orderId={orderId}
        token={token as string}
        backHref={`/${locale}/o/${orderId}?t=${encodeURIComponent(token as string)}`}
      />
    </main>
  );
}
