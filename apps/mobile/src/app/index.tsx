import { assertIntegerHuf } from "@namitiszunk/core";
import { View } from "react-native";
import { useTranslations } from "use-intl";

// Scaffold screen from T-012, translated in T-015: proves core, i18n and NativeWind resolve.
export default function Home() {
  const t = useTranslations();

  return (
    <View
      accessibilityLabel={t("mobile.title")}
      className="flex-1 bg-black"
      testID={`core-check-${assertIntegerHuf(0)}`}
    />
  );
}
