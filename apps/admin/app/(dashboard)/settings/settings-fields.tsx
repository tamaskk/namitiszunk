// No "use client": a module of the client forms (settings-tabs.tsx), so hooks and form objects may cross.
import type { VenueSettings } from "@namitiszunk/core/settings";
import {
  Button,
  Checkbox,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from "@namitiszunk/ui";
import type { VenueSettingsInput } from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import {
  useFormContext,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import { useMenuAction, useValidationText } from "../menu/use-menu-action";
import { saveSettingsAction } from "./actions";

/**
 * Saves one tab. Field errors land on the fields with the same path (the form values mirror the
 * input); `fieldFor` maps a path the form does not have, such as an opening-hours index.
 */
export function useSaveSettings<V extends FieldValues>(
  form: UseFormReturn<V>,
  fieldFor: (path: string) => string = (path) => path,
) {
  const t = useTranslations("admin.settings");
  const validationText = useValidationText();
  const [pending, run] = useMenuAction();

  function save(
    input: VenueSettingsInput,
    onSaved?: (saved: VenueSettings) => void,
  ) {
    run(() => saveSettingsAction(input), {
      onDone: (saved) => {
        toast.success(t("saved"));
        form.reset(form.getValues());
        onSaved?.(saved);
      },
      onError: ({ code, fields }) => {
        for (const [path, key] of Object.entries(fields ?? {}))
          form.setError(fieldFor(path) as FieldPath<V>, {
            message: validationText(key),
          });
        toast.error(
          code === "validation_failed"
            ? t("errors.validation")
            : code === "forbidden"
              ? t("errors.forbidden")
              : t("errors.generic"),
        );
      },
    });
  }

  return [pending, save] as const;
}

export function TextField({
  name,
  label,
  hint,
  type,
  numeric,
  decimal,
  autoComplete = "off",
}: {
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "email" | "time";
  numeric?: boolean;
  decimal?: boolean;
  autoComplete?: string;
}) {
  const form = useFormContext();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={String(field.value ?? "")}
              type={type}
              autoComplete={autoComplete}
              inputMode={
                numeric ? (decimal ? "decimal" : "numeric") : undefined
              }
              className={numeric ? "tabular-nums" : undefined}
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CheckField({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint?: string;
}) {
  const form = useFormContext();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Checkbox
            label={label}
            hint={hint}
            checked={Boolean(field.value)}
            onChange={field.onChange}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SaveButton({ pending }: { pending: boolean }) {
  const t = useTranslations("admin.settings");
  return (
    <Button type="submit" loading={pending} className="self-start">
      {t("save")}
    </Button>
  );
}
