"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

// Promo codes that cannot be loaded (database down, timeout) keep the Admin shell around them.
export default function PromosError({
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
