"use client";

import type { VenueSettings } from "@namitiszunk/core/settings";
import { Form } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";

import {
  CheckField,
  SaveButton,
  TextField,
  useSaveSettings,
} from "./settings-fields";

const days = [1, 2, 3, 4, 5, 6, 7] as const;

type Values = {
  businessDayStart: string;
  days: { open: boolean; from: string; to: string }[];
};

function toValues(hours: VenueSettings["hours"]): Values {
  return {
    businessDayStart: hours.businessDayStart,
    days: days.map((day) => {
      const saved = hours.openingHours.find((h) => h.day === day);
      return {
        open: Boolean(saved),
        from: saved?.open ?? "22:00",
        to: saved?.close ?? "05:00",
      };
    }),
  };
}

/** Opening hours per ISO day; a close before the open is the next morning (22:00–05:00). */
export function HoursForm({ hours }: { hours: VenueSettings["hours"] }) {
  const t = useTranslations("admin.settings.hours");
  const form = useForm<Values>({ defaultValues: toValues(hours) });
  const watchedDays = useWatch({ control: form.control, name: "days" });
  const openDays = watchedDays.flatMap((d, index) => (d.open ? [index] : []));
  // The server numbers only the open days: openingHours.1.close is the second open day's close.
  const [pending, save] = useSaveSettings(form, (path) =>
    path.replace(
      /^openingHours\.(\d+)\.(open|close)$/,
      (_, i: string, field: string) =>
        `days.${openDays[Number(i)] ?? 0}.${field === "open" ? "from" : "to"}`,
    ),
  );

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          save({
            tab: "hours",
            businessDayStart: values.businessDayStart,
            openingHours: values.days.flatMap((d, index) =>
              d.open ? [{ day: index + 1, open: d.from, close: d.to }] : [],
            ),
          }),
        )}
        className="flex max-w-120 flex-col gap-6"
      >
        <p className="text-small text-text-muted">{t("intro")}</p>
        <ul className="flex flex-col gap-4">
          {days.map((day, index) => (
            <li
              key={day}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <CheckField name={`days.${index}.open`} label={t(`day${day}`)} />
              {watchedDays[index]?.open && (
                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    name={`days.${index}.from`}
                    label={t("open")}
                    type="time"
                  />
                  <TextField
                    name={`days.${index}.to`}
                    label={t("close")}
                    type="time"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <TextField
          name="businessDayStart"
          label={t("businessDayStart")}
          hint={t("businessDayStartHint")}
          type="time"
        />
        <SaveButton pending={pending} />
      </form>
    </Form>
  );
}
