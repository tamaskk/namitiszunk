import { View } from "react-native";
import { useTranslations } from "use-intl";

// Scaffold screen: proves i18n and the token theme (bg-bg) resolve. Mobile never imports core (ARCHITECTURE §05).
export default function Home() {
  const t = useTranslations();

  return (
    <View accessibilityLabel={t("mobile.title")} className="flex-1 bg-bg" />
  );
}
