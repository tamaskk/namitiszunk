"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

// At the app root so it also catches the (dashboard) layout: a failed session load (database
// down, timeout). Sentry gets the error from the server instrumentation.
export default function HqError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations("hq.shell");
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center px-4">
      <EmptyState
        role="alert"
        message={t("loadFailed")}
        action={<Button onClick={() => retry()}>{t("retry")}</Button>}
      />
    </main>
  );
}
