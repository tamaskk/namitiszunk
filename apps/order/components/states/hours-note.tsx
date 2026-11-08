"use client";

import type { VenueStatusResponse } from "@namitiszunk/validators";
import { useFormatter, useTranslations } from "next-intl";

// Close enough to matter: earlier in the night the last order is noise.
const LAST_ORDER_NOTICE_MS = 60 * 60_000;

/**
 * The opening-hours line of the live status (T-048): the next opening when closed by the hours,
 * the last order in the final hour. `at` is when the status was read, so render never reads the clock.
 */
export function HoursNote({
  status,
  at,
}: {
  status: VenueStatusResponse;
  at: number;
}) {
  const t = useTranslations("order.menu");
  const format = useFormatter();
  if (status.status === "closed" && status.nextOpenAt) {
    return (
      <p className="text-body">
        {t("nextOpen", {
          at: format.dateTime(new Date(status.nextOpenAt), {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
          }),
        })}
      </p>
    );
  }
  if (
    status.status === "open" &&
    status.lastOrderAt &&
    Date.parse(status.lastOrderAt) - at <= LAST_ORDER_NOTICE_MS
  ) {
    return (
      <p className="rounded-lg border border-warning bg-surface p-4 text-body">
        {t("lastOrder", {
          time: format.dateTime(new Date(status.lastOrderAt), {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })}
      </p>
    );
  }
  return null;
}
