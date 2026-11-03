import { defaultLocale, isLocale, type Locale } from "@namitiszunk/i18n";

// shortcut: reads the device language once at start-up; switch to the user setting when accounts reach mobile (phase 3).
export function deviceLocale(): Locale {
  const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0];
  return isLocale(language) ? language : defaultLocale;
}
