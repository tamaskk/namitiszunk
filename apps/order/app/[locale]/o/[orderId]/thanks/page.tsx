import { getGuestThanks } from "@namitiszunk/core/orders";
import type { Locale } from "@namitiszunk/i18n";
import { Button } from "@namitiszunk/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ReportProblem } from "@/components/report-problem/report-problem";
import { loadForGuest } from "@/lib/guest-data";

import { OrderLoading } from "../order-loading";
import { ReviewForm } from "./review-form";

// The guest token is in the URL: never send it on as a Referer, never index the page.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Thanks and rating (T-045): the live page sends the guest here once the order is picked up.
export default function ThanksPage(
  props: PageProps<"/[locale]/o/[orderId]/thanks">,
) {
  return (
    <Suspense fallback={<OrderLoading />}>
      <Thanks {...props} />
    </Suspense>
  );
}

async function Thanks({
  params,
  searchParams,
}: PageProps<"/[locale]/o/[orderId]/thanks">) {
  const { locale, orderId } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale as Locale);
  const thanks = await loadForGuest(orderId, token, (actor) =>
    getGuestThanks(actor, orderId),
  );
  if (!thanks || typeof token !== "string") notFound();
  const query = `?t=${encodeURIComponent(token)}`;
  // Not picked up yet: the live page is the right place.
  if (thanks.order.status !== "picked_up")
    redirect(`/${locale}/o/${orderId}${query}`);
  const t = await getTranslations("order.thanks");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-order tabular-nums">{thanks.order.number}</p>
        <h1 className="text-h1 text-success">{t("title")}</h1>
        <p className="text-body text-text-muted">{t("body")}</p>
      </header>

      <ReviewForm
        orderId={orderId}
        token={token}
        alreadyReviewed={thanks.reviewed}
      />

      <div className="flex flex-col gap-3">
        <Button variant="ghost" asChild>
          <a href={`/${locale}/r/${orderId}${query}`}>
            {t("confirmationLink")}
          </a>
        </Button>
        <ReportProblem orderId={orderId} token={token} />
      </div>
    </main>
  );
}
