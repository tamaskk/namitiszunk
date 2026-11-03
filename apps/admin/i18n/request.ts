import { defaultLocale, isLocale, messages } from "@namitiszunk/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

// Staff apps have no locale in the URL; the cookie stands in until the user setting exists.
export default getRequestConfig(async () => {
  const stored = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  return { locale, messages: messages[locale], timeZone: "Europe/Budapest" };
});
