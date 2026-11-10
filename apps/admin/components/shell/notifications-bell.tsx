"use client";

import {
  Button,
  EmptyState,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@namitiszunk/ui";
import { Bell } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

export type BellItem = {
  kind: "problemReport" | "refundFailed";
  orderId: string;
  shortNumber: number | null;
  at: Date;
};

/** Problem reports (T-046) and failed refunds (T-034) of the last 7 days; links to orders come with T-056. */
export function NotificationsBell({ items }: { items: BellItem[] }) {
  const t = useTranslations("admin.shell");
  const format = useFormatter();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="relative min-w-12 px-3"
          aria-label={t("notificationsCount", { count: items.length })}
        >
          <Bell aria-hidden />
          {items.length > 0 && (
            <span
              aria-hidden
              className="absolute top-2 right-2 size-2 rounded-full bg-danger"
            />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel={t("close")}>
        <SheetHeader>
          <SheetTitle>{t("notifications")}</SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <EmptyState message={t("notificationsEmpty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={`${item.kind}:${item.orderId}`}
                className="flex flex-col gap-1 rounded-lg border border-border p-4"
              >
                <span
                  className={
                    item.kind === "refundFailed"
                      ? "text-body text-danger"
                      : "text-body"
                  }
                >
                  {t(item.kind, {
                    number: item.shortNumber ?? t("noNumber"),
                  })}
                </span>
                <span className="text-small text-text-muted">
                  {format.dateTime(item.at, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
