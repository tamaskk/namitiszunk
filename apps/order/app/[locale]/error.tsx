"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

// Unexpected server errors (database down) on guest pages; Sentry already has the error.
export default function GuestError({ reset }: { reset: () => void }) {
  const t = useTranslations("common.error");

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-6">
      <EmptyState
        message={t("message")}
        action={<Button onClick={reset}>{t("retry")}</Button>}
      />
    </main>
  );
}
