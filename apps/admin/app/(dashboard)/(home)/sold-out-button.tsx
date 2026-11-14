"use client";

import { Button } from "@namitiszunk/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setItemAvailableAction } from "@/app/(dashboard)/menu/actions";

/** Marks an item sold out or available again from the Dashboard (T-063); the menu's own action. */
export function SoldOutButton({
  itemId,
  itemName,
  available,
}: {
  itemId: string;
  itemName: string;
  available: boolean;
}) {
  const t = useTranslations("admin.dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function toggle() {
    setFailed(false);
    startTransition(async () => {
      const result = await setItemAvailableAction({
        id: itemId,
        available: !available,
      });
      if ("error" in result) {
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }

  const label = available
    ? t("products.setSoldOut")
    : t("products.setAvailable");
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        aria-label={`${itemName}: ${label}`}
        onClick={toggle}
      >
        {label}
      </Button>
      {failed && (
        <span role="alert" className="text-small text-danger">
          {t("failed")}
        </span>
      )}
    </span>
  );
}
