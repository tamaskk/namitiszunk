"use client";

import { Button, Input, Label } from "@namitiszunk/ui";
import { adminOrdersExportQuerySchema } from "@namitiszunk/validators";
import { useState } from "react";

export type ExportRangeLabels = {
  title: string;
  from: string;
  to: string;
  hint: string;
  invalidRange: string;
  csv: string;
  xlsx: string;
  /** Shown when the route refuses without a message of its own. */
  failed: string;
};

/**
 * A from–to day range with CSV and Excel downloads from `path` (Orders T-056, Payouts T-059).
 * Fetched rather than linked: a refused export (too many rows, rate limit) shows its message
 * here instead of being saved as a small text file.
 */
export function ExportRange({
  id,
  path,
  initialDate,
  labels,
}: {
  id: string;
  path: string;
  initialDate: string;
  labels: ExportRangeLabels;
}) {
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const range = adminOrdersExportQuerySchema.safeParse({
    from,
    to,
    format: "csv",
  });
  const [pending, setPending] = useState<"csv" | "xlsx" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function download(format: "csv" | "xlsx") {
    setPending(format);
    setFailure(null);
    try {
      const response = await fetch(
        `${path}?${new URLSearchParams({ from, to, format })}`,
      );
      if (!response.ok) {
        setFailure((await response.text()) || labels.failed);
        return;
      }
      const filename =
        /filename="([^"]+)"/.exec(
          response.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? `export.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailure(labels.failed);
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <h2 id={id} className="text-h3">
        {labels.title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-from`}>{labels.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-to`}>{labels.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <p
        role={range.success ? undefined : "alert"}
        className={
          range.success
            ? "text-small text-text-muted"
            : "text-small text-danger"
        }
      >
        {range.success ? labels.hint : labels.invalidRange}
      </p>
      <div className="flex flex-wrap gap-3">
        {(["csv", "xlsx"] as const).map((format) => (
          <Button
            key={format}
            variant="secondary"
            disabled={!range.success || pending !== null}
            onClick={() => void download(format)}
          >
            {labels[format]}
          </Button>
        ))}
      </div>
      {failure && (
        <p role="alert" className="text-small text-danger">
          {failure}
        </p>
      )}
    </section>
  );
}
