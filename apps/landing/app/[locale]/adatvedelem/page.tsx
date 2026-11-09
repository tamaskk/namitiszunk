import type { Locale } from "@namitiszunk/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage } from "@/components/legal-page";
import { PrivacyEn } from "@/content/legal/privacy-en";
import { PrivacyHu } from "@/content/legal/privacy-hu";

// shortcut: draft until the lawyer approves it (T-003 step 5); then a dated version and effectiveDate.
const PRIVACY_VERSION = "draft-2026-11";

const content = { hu: PrivacyHu, en: PrivacyEn } satisfies Record<
  Locale,
  () => React.ReactNode
>;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/adatvedelem">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "landing.legal",
  });
  return { title: t("privacy") };
}

export default async function PrivacyPage({
  params,
}: PageProps<"/[locale]/adatvedelem">) {
  const { locale } = await params;
  // The layout has already sent unknown locales to notFound().
  setRequestLocale(locale as Locale);
  const t = await getTranslations("landing.legal");
  const Content = content[locale as Locale];

  return (
    <LegalPage title={t("privacy")} version={PRIVACY_VERSION}>
      <Content />
    </LegalPage>
  );
}
