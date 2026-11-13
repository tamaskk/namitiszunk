"use client";

import { Button, EmptyState } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";

// Payouts that cannot be loaded (Stripe or the database down, timeout) keep the Admin shell around them.
export default function PayoutsError({
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
