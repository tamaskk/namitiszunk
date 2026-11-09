import type { Locale } from "@namitiszunk/i18n";
import { CURRENT_TERMS_VERSION } from "@namitiszunk/validators";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage } from "@/components/legal-page";
import { TermsEn } from "@/content/legal/terms-en";
import { TermsHu } from "@/content/legal/terms-hu";

const content = { hu: TermsHu, en: TermsEn } satisfies Record<
  Locale,
  () => React.ReactNode
>;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/aszf">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "landing.legal",
  });
  return { title: t("terms") };
}

// The version shown is the one the checkout records on every order (Order.termsVersion).
export default async function TermsPage({
  params,
}: PageProps<"/[locale]/aszf">) {
  const { locale } = await params;
  // The layout has already sent unknown locales to notFound().
  setRequestLocale(locale as Locale);
  const t = await getTranslations("landing.legal");
  const Content = content[locale as Locale];

  return (
    <LegalPage title={t("terms")} version={CURRENT_TERMS_VERSION}>
      <Content />
    </LegalPage>
  );
}
