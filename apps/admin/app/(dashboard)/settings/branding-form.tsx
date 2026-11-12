"use client";

import type { VenueSettings } from "@namitiszunk/core/settings";
import { accentIsReadable } from "@namitiszunk/core/settings/contrast";
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useFormContext, useWatch } from "react-hook-form";

import { uploadImage } from "@/lib/upload-image";

import { SaveButton, useSaveSettings } from "./settings-fields";

type Values = { logoUrl: string; coverUrl: string; accentColor: string };

/** Logo, cover and the accent; an accent under 4.5:1 is saved but the guest pages ignore it. */
export function BrandingForm({
  branding,
  venueId,
}: {
  branding: VenueSettings["branding"];
  venueId: string;
}) {
  const t = useTranslations("admin.settings.branding");
  const form = useForm<Values>({
    defaultValues: {
      logoUrl: branding.logoUrl,
      coverUrl: branding.coverUrl,
      accentColor: branding.accentColor,
    },
  });
  const [pending, save] = useSaveSettings(form);
  const accent = useWatch({
    control: form.control,
    name: "accentColor",
  }).trim();
  const wellFormed = /^#[0-9a-fA-F]{6}$/.test(accent);
  const unreadable = wellFormed && !accentIsReadable(accent);

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          save({ tab: "branding", ...values, accentColor: accent }),
        )}
        className="flex max-w-120 flex-col gap-6"
      >
        <ImageField name="logoUrl" label={t("logo")} venueId={venueId} />
        <ImageField name="coverUrl" label={t("cover")} venueId={venueId} />
        <FormField
          control={form.control}
          name="accentColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("accent")}</FormLabel>
              <div className="flex items-center gap-3">
                <FormControl>
                  <Input {...field} autoComplete="off" className="flex-1" />
                </FormControl>
                {wellFormed && (
                  // The venue's own colour, shown as typed: the one place a stored value is painted.
                  <span
                    aria-hidden
                    className="size-12 shrink-0 rounded-md border border-border"
                    style={{ backgroundColor: accent }}
                  />
                )}
              </div>
              <FormDescription>{t("accentHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {unreadable && (
          // Polite: it updates while the owner types.
          <p role="status" className="text-small text-warning">
            {t("lowContrast")}
          </p>
        )}
        <SaveButton pending={pending} />
      </form>
    </Form>
  );
}

function ImageField({
  name,
  label,
  venueId,
}: {
  name: "logoUrl" | "coverUrl";
  label: string;
  venueId: string;
}) {
  const t = useTranslations("admin.settings.branding");
  const form = useFormContext<Values>();
  const [uploading, setUploading] = useState(false);
  const url = useWatch({ control: form.control, name });

  async function upload(file: File) {
    setUploading(true);
    try {
      form.setValue(name, await uploadImage(venueId, "venue", file), {
        shouldDirty: true,
      });
      form.clearErrors(name);
    } catch {
      // The token route and Blob refuse wrong types and files over 5 MB; one message covers all.
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <FormField
      control={form.control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- a Blob URL the owner just chose
            <img
              src={url}
              alt=""
              className={
                name === "logoUrl"
                  ? "size-24 rounded-md object-contain"
                  : "aspect-video w-full rounded-md object-cover"
              }
            />
          )}
          <div className="flex flex-wrap gap-2">
            <FormControl>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                aria-busy={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
                className="flex-1 py-3"
              />
            </FormControl>
            {url && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.setValue(name, "", { shouldDirty: true })}
              >
                {t("remove", { field: label })}
              </Button>
            )}
          </div>
          <FormDescription>
            {uploading ? t("uploading") : t("imageHint")}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
