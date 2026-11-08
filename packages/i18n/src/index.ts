import en from "../messages/en.json";
import hu from "../messages/hu.json";

// Client components import these from "@namitiszunk/i18n/format": this entry bundles every message file.
export { formatDateTime, formatHuf } from "./format";

export const locales = ["hu", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "hu";

/** hu.json is the source of truth; message keys are typed from it in every app. */
export type Messages = typeof hu;

export const messages: Record<Locale, Messages> = { hu, en };

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
