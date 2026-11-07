"use client";

import { useTranslations } from "next-intl";

// A client component: next-intl reads the locale from the provider, not from request headers outside Suspense.
/** Menu skeleton: the header, the search field and a few product rows. */
export default function MenuLoading() {
  const t = useTranslations("common");
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-dvh max-w-120 flex-col gap-4 bg-bg p-4"
    >
      <p className="sr-only">{t("loading")}</p>
      <div className="h-8 w-1/2 rounded-sm bg-surface motion-safe:animate-pulse" />
      <div className="h-12 rounded-sm bg-surface motion-safe:animate-pulse" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 w-24 rounded-full bg-surface motion-safe:animate-pulse"
          />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-28 rounded-lg border border-border bg-surface motion-safe:animate-pulse"
        />
      ))}
    </main>
  );
}
