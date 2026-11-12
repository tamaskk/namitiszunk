import { getVenueSettings } from "@namitiszunk/core/settings";
import { settingsTabs, type SettingsTab } from "@namitiszunk/validators";
import { getLocale, getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";
import { guestMenuUrl } from "@/lib/order-app";

import { SettingsTabs } from "./settings-tabs";

export const instant = false;

/** Settings (T-058): Owner only; each tab saves on its own, with an audit entry. */
export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const [{ actor, venue }, { tab }, t] = await Promise.all([
    requireAdminModule("settings"),
    searchParams,
    getTranslations("admin"),
  ]);
  const settings = await getVenueSettings(actor, venue.id);
  const initialTab = settingsTabs.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "basics";
  return (
    <div className="flex max-w-content flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("nav.settings")}</h1>
        <p className="text-small text-text-muted">{t("settings.intro")}</p>
      </div>
      <SettingsTabs
        settings={settings}
        venueId={venue.id}
        initialTab={initialTab}
        previewUrl={guestMenuUrl(settings.slug, await getLocale(), null)}
      />
    </div>
  );
}
