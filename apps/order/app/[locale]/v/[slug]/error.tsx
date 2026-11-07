"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import * as Sentry from "@sentry/nextjs";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function MenuError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("order.menu");
  // An error boundary swallows the error, so it is reported here once.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center bg-bg p-4">
      <EmptyState
        role="alert"
        message={t("loadError")}
        action={<Button onClick={reset}>{t("retry")}</Button>}
      />
    </main>
  );
}
