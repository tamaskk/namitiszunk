import { assertIntegerHuf } from "@namitiszunk/core";
import type { Locale } from "@namitiszunk/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Scaffold page from T-012, translated in T-015: proves core and i18n both resolve.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  // The layout has already sent unknown locales to notFound().
  setRequestLocale(locale as Locale);
  const t = await getTranslations();

  return (
    <main data-app="landing" data-core-check={assertIntegerHuf(0)}>
      <h1>{t("common.appName")}</h1>
      <p>{t("landing.tagline")}</p>
    </main>
  );
}
