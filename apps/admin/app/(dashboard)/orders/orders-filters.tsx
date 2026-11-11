"use client";

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@namitiszunk/ui";
import {
  adminOrdersExportQuerySchema,
  orderStatuses,
  paymentMethodFilters,
} from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const ANY = "any";

export type FilterValues = {
  date: string;
  number: string;
  status: string;
  bar: string;
  min: string;
  max: string;
  method: string;
  problem: boolean;
  missingReceipt: boolean;
};

/** The Orders list filters and the export (T-056); both live in the URL, so a link shares the view. */
export function OrdersFilters({
  initial,
  bars,
}: {
  initial: FilterValues;
  bars: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.orders");
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [from, setFrom] = useState(initial.date);
  const [to, setTo] = useState(initial.date);
  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function apply(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (values.date) query.set("date", values.date);
    if (values.number.trim()) query.set("number", values.number.trim());
    if (values.status !== ANY) query.set("status", values.status);
    if (values.bar !== ANY) query.set("bar", values.bar);
    if (values.min) query.set("min", values.min);
    if (values.max) query.set("max", values.max);
    if (values.method !== ANY) query.set("method", values.method);
    if (values.problem) query.set("problem", "1");
    if (values.missingReceipt) query.set("receipt", "missing");
    router.push(`/orders?${query}`);
  }

  const range = adminOrdersExportQuerySchema.safeParse({
    from,
    to,
    format: "csv",
  });
  const exportHref = (format: "csv" | "xlsx") =>
    `/orders/export?${new URLSearchParams({ from, to, format })}`;

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={apply}
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="orders-date">{t("filters.date")}</Label>
            <Input
              id="orders-date"
              type="date"
              value={values.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="orders-number">{t("filters.number")}</Label>
            <Input
              id="orders-number"
              inputMode="numeric"
              placeholder={t("filters.numberPlaceholder")}
              value={values.number}
              onChange={(e) => set("number", e.target.value)}
            />
          </div>
          <SelectField
            id="orders-status"
            label={t("filters.status")}
            value={values.status}
            onChange={(value) => set("status", value)}
            options={[
              { value: ANY, label: t("filters.anyStatus") },
              ...orderStatuses
                .filter((s) => s !== "awaiting_payment" && s !== "cancelled")
                .map((status) => ({
                  value: status,
                  label: t(`statuses.${status}`),
                })),
            ]}
          />
          <SelectField
            id="orders-bar"
            label={t("filters.bar")}
            value={values.bar}
            onChange={(value) => set("bar", value)}
            options={[
              { value: ANY, label: t("filters.anyBar") },
              ...bars.map((bar) => ({ value: bar.id, label: bar.name })),
            ]}
          />
          <SelectField
            id="orders-method"
            label={t("filters.method")}
            value={values.method}
            onChange={(value) => set("method", value)}
            options={[
              { value: ANY, label: t("filters.anyMethod") },
              ...paymentMethodFilters.map((method) => ({
                value: method,
                label: t(`filters.methods.${method}`),
              })),
            ]}
          />
          <div className="flex gap-3">
            {(["min", "max"] as const).map((key) => (
              <div key={key} className="flex flex-1 flex-col gap-2">
                <Label htmlFor={`orders-${key}`}>{t(`filters.${key}`)}</Label>
                <Input
                  id={`orders-${key}`}
                  inputMode="numeric"
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value.replace(/\D/g, ""))}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox
            label={t("filters.problem")}
            checked={values.problem}
            onChange={(checked) => set("problem", checked)}
          />
          <Checkbox
            label={t("filters.missingReceipt")}
            checked={values.missingReceipt}
            onChange={(checked) => set("missingReceipt", checked)}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{t("filters.apply")}</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/orders")}
          >
            {t("filters.reset")}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="orders-export"
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
      >
        <h2 id="orders-export" className="text-h3">
          {t("export.title")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-from">{t("export.from")}</Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-to">{t("export.to")}</Label>
            <Input
              id="export-to"
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
          {range.success ? t("export.hint") : t("export.invalidRange")}
        </p>
        <div className="flex flex-wrap gap-3">
          {(["csv", "xlsx"] as const).map((format) =>
            range.success ? (
              <Button key={format} asChild variant="secondary">
                <a href={exportHref(format)} download>
                  {t(`export.${format}`)}
                </a>
              </Button>
            ) : (
              <Button key={format} variant="secondary" disabled>
                {t(`export.${format}`)}
              </Button>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
