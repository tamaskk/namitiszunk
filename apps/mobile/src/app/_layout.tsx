import "../../global.css";

import { messages } from "@namitiszunk/i18n";
import { Stack } from "expo-router";
import { IntlProvider } from "use-intl";

import { deviceLocale } from "@/i18n";

const locale = deviceLocale();

export default function RootLayout() {
  return (
    <IntlProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="Europe/Budapest"
    >
      <Stack screenOptions={{ headerShown: false }} />
    </IntlProvider>
  );
}
