import { getGuestLiveOrder } from "@namitiszunk/core/orders";
import type { Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { loadForGuest } from "@/lib/guest-data";
import { menuHref } from "@/lib/menu-href";

import { OrderLoading } from "./order-loading";
import { OrderStatus } from "./order-status";

// Guest pages: never send the URL on as a Referer, never index them.
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/o/[orderId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "order.status",
  });
  return {
    title: t("pageTitle"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

// The live order status (T-043): /o/[orderId], from checkout and the SMS link. Token: see proxy.ts.
export default function OrderStatusPage(
  props: PageProps<"/[locale]/o/[orderId]">,
) {
  return (
    <Suspense fallback={<OrderLoading />}>
      <LiveOrder {...props} />
    </Suspense>
  );
}

async function LiveOrder({ params }: PageProps<"/[locale]/o/[orderId]">) {
  const { locale, orderId } = await params;
  setRequestLocale(locale as Locale);
  const guest = await loadForGuest(orderId, (actor) =>
    getGuestLiveOrder(actor, orderId),
  );
  if (!guest) notFound();

  return (
    <OrderStatus
      initial={guest.data.order}
      token={guest.token}
      menuHref={menuHref(locale, guest.data.menu)}
    />
  );
}
