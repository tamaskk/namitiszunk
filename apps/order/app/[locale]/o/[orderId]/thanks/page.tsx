import { getGuestThanks } from "@namitiszunk/core/orders";
import type { Locale } from "@namitiszunk/i18n";
import { Button } from "@namitiszunk/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ReorderButton } from "@/components/reorder/reorder-button";
import { ReportProblem } from "@/components/report-problem/report-problem";
import { loadForGuest } from "@/lib/guest-data";
import { menuHref } from "@/lib/menu-href";

import { OrderLoading } from "../order-loading";
import { ReviewForm } from "./review-form";

// Guest pages: never send the URL on as a Referer, never index them.
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/o/[orderId]/thanks">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "order.thanks",
  });
  return {
    title: t("pageTitle"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

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

async function Thanks({ params }: PageProps<"/[locale]/o/[orderId]/thanks">) {
  const { locale, orderId } = await params;
  setRequestLocale(locale as Locale);
  const guest = await loadForGuest(orderId, (actor) =>
    getGuestThanks(actor, orderId),
  );
  if (!guest) notFound();
  const { data: thanks, token } = guest;
  // Not picked up yet: the live page is the right place.
  if (thanks.order.status !== "picked_up") redirect(`/${locale}/o/${orderId}`);
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
        <Button variant="secondary" asChild>
          <a href={menuHref(locale, thanks.menu)}>{t("orderMore")}</a>
        </Button>
        <ReorderButton orderId={orderId} token={token} />
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="ghost" asChild>
          <a href={`/${locale}/r/${orderId}`}>{t("confirmationLink")}</a>
        </Button>
        <ReportProblem orderId={orderId} token={token} />
      </div>
    </main>
  );
}
