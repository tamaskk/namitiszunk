"use client";

import { EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

/** An unknown, unpublished or malformed venue slug. */
export default function MenuNotFound() {
  const t = useTranslations("order.menu");
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center bg-bg p-4">
      <EmptyState message={t("notFound")} />
    </main>
  );
}
