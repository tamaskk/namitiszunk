import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

// latin-ext carries the Hungarian ő and ű.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

// HQ is never listed by a search engine (T-066); robots.ts and X-Robots-Tag say the same.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("hq");
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Staff pages are per-user behind a login, so the locale cookie may block rendering.
export const instant = false;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
