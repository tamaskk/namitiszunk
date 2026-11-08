import { guestActorFromToken } from "@namitiszunk/auth";
import { connectDb } from "@namitiszunk/core/api";
import { NotFoundError } from "@namitiszunk/core/errors";
import { getGuestOrder } from "@namitiszunk/core/orders";
import type { Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrderLoading } from "./order-loading";
import { OrderStatus } from "./order-status";

// The guest token is in the URL: never send it on as a Referer, never index the page.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

async function loadOrder(orderId: string, token: string) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");
  await connectDb(uri);
  try {
    return await getGuestOrder(
      await guestActorFromToken(orderId, token),
      orderId,
    );
  } catch (error) {
    // No order, no token and a wrong token all look the same (T-030).
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

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
  if (typeof token !== "string") notFound();
  const order = await loadOrder(orderId, token);
  if (!order) notFound();

  return <OrderStatus initial={order} token={token} />;
}
