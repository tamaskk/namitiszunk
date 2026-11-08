"use client";

import { useTranslations } from "next-intl";

// A client component, like the menu skeleton: the locale comes from the provider.
export default function CheckoutLoading() {
  const t = useTranslations("common");
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-dvh max-w-120 flex-col gap-4 bg-bg p-4"
    >
      <p className="sr-only">{t("loading")}</p>
      <div className="h-8 w-1/2 rounded-sm bg-surface motion-safe:animate-pulse" />
      <div className="h-28 rounded-lg border border-border bg-surface motion-safe:animate-pulse" />
    </main>
  );
}
