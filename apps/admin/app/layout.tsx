import { Toaster } from "@namitiszunk/ui";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

// latin-ext carries the Hungarian ő and ű.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

// Staff pages are per-user behind a login, so the locale cookie may block rendering.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

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
        <Toaster />
      </body>
    </html>
  );
}
