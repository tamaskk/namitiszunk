"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

// A Dashboard that cannot be loaded (database down, timeout) keeps the Admin shell around it.
export default function DashboardError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations("admin.shell");
  return (
    <EmptyState
      role="alert"
      message={t("loadFailed")}
      action={<Button onClick={() => retry()}>{t("retry")}</Button>}
    />
  );
}
