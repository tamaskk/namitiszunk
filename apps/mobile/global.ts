import type { Locale, Messages } from "@namitiszunk/i18n";
// Augmentation fails with TS2664 unless the program loads the module's root entry.
import type {} from "use-intl";

// Types every t("...") key from hu.json, so a missing key fails typecheck.
declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
