import type { Locale, Messages } from "@namitiszunk/i18n";
// Augmentation fails with TS2664 unless the program loads next-intl's root entry.
import type {} from "next-intl";

// Types every t("...") key from hu.json, so a missing key fails typecheck.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
