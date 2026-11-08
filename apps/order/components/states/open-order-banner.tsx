"use client";

import { buttonVariants } from "@namitiszunk/ui";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { readOpenOrders } from "@/lib/open-orders";

const noSubscription = () => () => undefined;

/**
 * Paid, then the connection dropped before the live page opened (T-048): the menu points back to
 * the newest order this phone remembers. Same link as after payment, so the token moves to a cookie.
 */
export function OpenOrderBanner() {
  const t = useTranslations("order.menu");
  const locale = useLocale();
  // A string snapshot stays equal between reads; localStorage exists only in the browser.
  const href = useSyncExternalStore(
    noSubscription,
    () => {
      const latest = readOpenOrders().at(-1);
      return latest
        ? `/${locale}/o/${latest.orderId}?t=${encodeURIComponent(latest.token)}`
        : "";
    },
    () => "",
  );
  if (!href) return null;
  return (
    <div className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-body">{t("openOrder")}</p>
      <a href={href} className={buttonVariants({ variant: "secondary" })}>
        {t("openOrderLink")}
      </a>
    </div>
  );
}
