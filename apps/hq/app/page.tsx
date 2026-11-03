import { assertIntegerHuf } from "@namitiszunk/core";
import { getTranslations } from "next-intl/server";

// Scaffold page from T-012, translated in T-015: proves core and i18n both resolve.
export default async function Home() {
  const t = await getTranslations();

  return (
    <main data-app="hq" data-core-check={assertIntegerHuf(0)}>
      <h1>{t("hq.title")}</h1>
    </main>
  );
}
