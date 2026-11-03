import { Inter } from "next/font/google";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

// latin-ext carries the Hungarian ő and ű.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

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
      <body>{children}</body>
    </html>
  );
}
