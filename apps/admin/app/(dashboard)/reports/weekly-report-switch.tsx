"use client";

import { Checkbox } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setWeeklyReportAction } from "./actions";

/** The signed-in Owner's or Manager's own weekly report e-mail (T-062). */
export function WeeklyReportSwitch({ on }: { on: boolean }) {
  const t = useTranslations("admin.reports.weekly");
  const [checked, setChecked] = useState(on);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setChecked(next);
    setStatus("idle");
    startTransition(async () => {
      // An unexpected server error is reported to Sentry on the server; here it only undoes the tick.
      const saved = await setWeeklyReportAction({ on: next }).then(
        (result) => !("error" in result),
        () => false,
      );
      if (!saved) setChecked(!next);
      setStatus(saved ? "saved" : "failed");
    });
  }

  return (
    <section
      aria-labelledby="report-weekly"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6"
    >
      <h2 id="report-weekly" className="text-h3">
        {t("title")}
      </h2>
      <Checkbox
        checked={checked}
        onChange={(next) => !pending && change(next)}
        label={t("label")}
        hint={t("hint")}
      />
      {/* The live region is always there, so a screen reader announces each change in it. */}
      <p role="status" className="min-h-6 text-small text-text-muted">
        {pending
          ? t("saving")
          : status === "saved"
            ? t(checked ? "savedOn" : "savedOff")
            : null}
      </p>
      {status === "failed" && !pending && (
        <p role="alert" className="text-small text-danger">
          {t("failed")}
        </p>
      )}
    </section>
  );
}
