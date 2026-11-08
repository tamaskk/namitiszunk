import { getGuestOrder } from "@namitiszunk/core/orders";
import type { Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { loadForGuest } from "@/lib/guest-data";

import { OrderLoading } from "./order-loading";
import { OrderStatus } from "./order-status";

// The guest token is in the URL: never send it on as a Referer, never index the page.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The live order status (T-043): /o/[orderId]?t=[guest token], from checkout and the SMS link.
export default function OrderStatusPage(
  props: PageProps<"/[locale]/o/[orderId]">,
) {
  return (
    <Suspense fallback={<OrderLoading />}>
      <LiveOrder {...props} />
    </Suspense>
  );
}

async function LiveOrder({
  params,
  searchParams,
}: PageProps<"/[locale]/o/[orderId]">) {
  const { locale, orderId } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale as Locale);
  const order = await loadForGuest(orderId, token, (actor) =>
    getGuestOrder(actor, orderId),
  );
  if (!order) notFound();

  return <OrderStatus initial={order} token={token as string} />;
}
