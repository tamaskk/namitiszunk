"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

const clockFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Budapest",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const everySecond = (onTick: () => void) => {
  const tick = setInterval(onTick, 1000);
  return () => clearInterval(tick);
};
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Full-screen Ready signal: moving background plus a ticking clock, so a screenshot is easy to spot. */
export function ReadyScreen({
  number,
  barName,
  isVip,
}: {
  number: string;
  barName: string;
  isVip: boolean;
}) {
  const t = useTranslations("order.status");
  const locale = useLocale();
  // Whole seconds, null on the server render so the server and browser clocks never mismatch.
  const seconds = useSyncExternalStore(everySecond, nowSeconds, () => null);
  const now = seconds === null ? null : new Date(seconds * 1000);

  return (
    // Modal over the order page; scrolls on a short landscape phone instead of clipping.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ready-title"
      className="ready-motion fixed inset-0 z-10 flex overflow-y-auto px-4 text-center text-on-primary"
    >
      <div className="m-auto flex flex-col items-center gap-4 py-6">
        <h1 id="ready-title" className="text-display">
          {t("views.ready.title")}
        </h1>
        <p className="text-label uppercase">{t("number")}</p>
        <p className="text-order tabular-nums">{number}</p>
        <p className="text-body">
          {isVip ? t("views.ready.vip") : t("views.ready.body")}
        </p>
        {!isVip && barName && (
          <p className="text-body">{t("pickupAt", { bar: barName })}</p>
        )}
        <time
          aria-label={t("clock")}
          className="text-h3 tabular-nums"
          dateTime={now?.toISOString()}
        >
          {now ? clockFormat(locale).format(now) : " "}
        </time>
      </div>
    </div>
  );
}
