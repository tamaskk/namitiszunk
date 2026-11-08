"use client";

import { useTranslations } from "next-intl";

/** While the order loads: the page frame and a spoken "Loading", never a blank screen. */
export function OrderLoading() {
  const t = useTranslations("common");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center gap-8 px-4 py-6">
      <p role="status" className="text-body text-text-muted">
        {t("loading")}
      </p>
      <div
        aria-hidden="true"
        className="h-12 w-32 animate-pulse rounded-md bg-surface motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-40 w-full animate-pulse rounded-lg bg-surface motion-reduce:animate-none"
      />
    </main>
  );
}
