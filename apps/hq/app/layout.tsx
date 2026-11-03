import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

// Staff pages are per-user behind a login, so the locale cookie may block rendering.
export const instant = false;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
