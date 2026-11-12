"use client";

import type { VenueSettings } from "@namitiszunk/core/settings";
import {
  Button,
  Form,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@namitiszunk/ui";
import { settingsTabs, type SettingsTab } from "@namitiszunk/validators";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import { BrandingForm } from "./branding-form";
import { HoursForm } from "./hours-form";
import { OrderForm } from "./order-form";
import {
  CheckField,
  SaveButton,
  TextField,
  useSaveSettings,
} from "./settings-fields";

export function SettingsTabs({
  settings,
  venueId,
  initialTab,
  previewUrl,
}: {
  settings: VenueSettings;
  venueId: string;
  initialTab: SettingsTab;
  previewUrl: string;
}) {
  const t = useTranslations("admin.settings");
  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="secondary" className="self-start">
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden />
          {t("preview")}
          <span className="sr-only">{t("opensNewTab")}</span>
        </a>
      </Button>
      <Tabs
        defaultValue={initialTab}
        // The tab stays in the URL, so a reload or a shared link opens the same one.
        onValueChange={(tab) =>
          window.history.replaceState(null, "", `?tab=${tab}`)
        }
        className="flex flex-col gap-6"
      >
        <TabsList className="h-auto max-w-full flex-wrap self-start">
          {settingsTabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="basics">
          <BasicsForm basics={settings.basics} />
        </TabsContent>
        <TabsContent value="hours">
          <HoursForm hours={settings.hours} />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingForm branding={settings.branding} venueId={venueId} />
        </TabsContent>
        <TabsContent value="order">
          <OrderForm order={settings.order} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsForm notifications={settings.notifications} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BasicsForm({ basics }: { basics: VenueSettings["basics"] }) {
  const t = useTranslations("admin.settings.basics");
  const form = useForm({ defaultValues: basics });
  const [pending, save] = useSaveSettings(form);
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          save({ tab: "basics", ...values }),
        )}
        className="flex max-w-120 flex-col gap-6"
      >
        <TextField name="name" label={t("name")} />
        <TextField
          name="address.postalCode"
          label={t("postalCode")}
          numeric
          autoComplete="postal-code"
        />
        <TextField name="address.city" label={t("city")} />
        <TextField name="address.street" label={t("street")} />
        <TextField name="company.name" label={t("companyName")} />
        <TextField
          name="company.taxNumber"
          label={t("taxNumber")}
          hint={t("taxNumberHint")}
          numeric
        />
        <TextField
          name="contactEmail"
          label={t("contactEmail")}
          hint={t("contactEmailHint")}
          type="email"
        />
        <SaveButton pending={pending} />
      </form>
    </Form>
  );
}

function NotificationsForm({
  notifications,
}: {
  notifications: VenueSettings["notifications"];
}) {
  const t = useTranslations("admin.settings.notifications");
  const form = useForm({ defaultValues: notifications });
  const [pending, save] = useSaveSettings(form);
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          save({ tab: "notifications", ...values }),
        )}
        className="flex max-w-120 flex-col gap-6"
      >
        <CheckField name="smsEnabled" label={t("sms")} hint={t("smsHint")} />
        <SaveButton pending={pending} />
      </form>
    </Form>
  );
}
