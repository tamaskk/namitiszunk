import { Inter } from "next/font/google";
import { messages } from "@namitiszunk/i18n";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";

import "../globals.css";

// latin-ext carries the Hungarian ő and ű.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Lets next-intl render statically instead of reading request headers.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        {/* Guest bundle carries only the namespaces its client components use. */}
        <NextIntlClientProvider
          messages={{
            common: messages[locale].common,
            order: messages[locale].order,
          }}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
