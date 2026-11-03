import { defaultLocale, locales } from "@namitiszunk/i18n";
import { defineRouting } from "next-intl/routing";

// Guest-facing apps carry the locale in the URL; the proxy picks it from the browser on first visit.
export const routing = defineRouting({ locales, defaultLocale });
