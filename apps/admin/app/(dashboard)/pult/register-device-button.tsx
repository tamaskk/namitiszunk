"use client";

import { Button, toast } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { registerDeviceAction } from "./actions";

export function RegisterDeviceButton({
  barId,
  barName,
}: {
  barId: string;
  barName: string;
}) {
  const t = useTranslations("admin.barView");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      aria-label={t("setUpFor", { bar: barName })}
      onClick={() =>
        startTransition(async () => {
          // Success redirects to the PIN screen; only a refusal comes back.
          const result = await registerDeviceAction({ barId });
          toast.error(
            result.error.code === "forbidden"
              ? t("setUpForbidden")
              : t("setUpFailed"),
          );
        })
      }
    >
      {t("setUp")}
    </Button>
  );
}
