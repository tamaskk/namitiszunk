"use client";

import type { DashboardBar } from "@namitiszunk/core/reports";
import { Button, cn } from "@namitiszunk/ui";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { adminApi } from "@/lib/admin-api";

const pauseMinutes = [5, 10, 15] as const;
type Minutes = 0 | (typeof pauseMinutes)[number];

/** Load and pause state per bar; a bar at its limit turns red (decision 2026-11-02). */
export function DashboardBars({
  bars,
  canPause,
}: {
  bars: DashboardBar[];
  canPause: boolean;
}) {
  const t = useTranslations("admin.dashboard");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The tapped button shows the spinner; a failure shows in that bar's card, where the Manager looks.
  const [tapped, setTapped] = useState<{ barId: string; minutes: Minutes }>();
  const [failedBar, setFailedBar] = useState<string>();

  function pause(barId: string, minutes: Minutes) {
    setTapped({ barId, minutes });
    setFailedBar(undefined);
    startTransition(async () => {
      try {
        await adminApi.barView.pause(barId, { minutes });
        router.refresh();
      } catch {
        // The api client already maps the error; the card tells the Manager to retry.
        setFailedBar(barId);
      }
    });
  }
  const loading = (barId: string, minutes: Minutes) =>
    pending && tapped?.barId === barId && tapped.minutes === minutes;

  return (
    <section aria-labelledby="dashboard-bars" className="flex flex-col gap-3">
      <h2 id="dashboard-bars" className="text-h3">
        {t("bars.title")}
      </h2>
      {bars.length === 0 ? (
        <p className="text-body text-text-muted">{t("bars.empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {bars.map((bar) => (
            <li
              key={bar.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-surface p-6",
                bar.atCapacity ? "border-danger" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-body font-semibold">{bar.name}</h3>
                {!bar.isOpen && (
                  <span className="text-small text-text-muted">
                    {t("bars.closed")}
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-h3 tabular-nums",
                  bar.atCapacity && "text-danger",
                )}
              >
                {bar.maxActiveOrders === null
                  ? t("bars.active", { count: bar.activeOrders })
                  : t("bars.activeOf", {
                      count: bar.activeOrders,
                      max: bar.maxActiveOrders,
                    })}
              </p>
              {bar.atCapacity && (
                <p className="text-small font-medium text-danger">
                  {t("bars.atCapacity")}
                </p>
              )}
              {bar.pausedUntil ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-small text-warning">
                    {t("bars.pausedUntil", {
                      time: format.dateTime(new Date(bar.pausedUntil), {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </span>
                  {canPause && (
                    <Button
                      variant="secondary"
                      aria-label={t("bars.resumeBar", { bar: bar.name })}
                      disabled={pending && !loading(bar.id, 0)}
                      loading={loading(bar.id, 0)}
                      onClick={() => pause(bar.id, 0)}
                    >
                      {t("bars.resume")}
                    </Button>
                  )}
                </div>
              ) : (
                canPause && (
                  <div
                    role="group"
                    aria-label={t("bars.pauseGroup", { bar: bar.name })}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span aria-hidden className="text-small text-text-muted">
                      {t("bars.pause")}
                    </span>
                    {pauseMinutes.map((minutes) => (
                      <Button
                        key={minutes}
                        variant="secondary"
                        disabled={pending && !loading(bar.id, minutes)}
                        loading={loading(bar.id, minutes)}
                        onClick={() => pause(bar.id, minutes)}
                      >
                        {t("bars.pauseFor", { minutes })}
                      </Button>
                    ))}
                  </div>
                )
              )}
              {failedBar === bar.id && (
                <p role="alert" className="text-small text-danger">
                  {t("failed")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
