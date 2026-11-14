import { canOpenHqModule, hqModules } from "@namitiszunk/core/hq";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { HqNav } from "@/components/hq-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { getHqActor } from "@/lib/hq-context";

// Every HQ page is per user behind a 2FA session, so the shell renders on each request.
export const instant = false;

/**
 * The HQ shell (T-066): only a platform member with a TOTP-checked session gets here. The menu
 * follows the platform role, and every page checks again with requireHqPage: hiding a link is
 * never the guard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [actor, t] = await Promise.all([getHqActor(), getTranslations("hq")]);
  const items = [
    { key: "home", path: "/", label: t("nav.home") },
    ...hqModules
      .filter((m) => canOpenHqModule(actor, m.key))
      .map((m) => ({ key: m.key, path: m.path, label: t(`nav.${m.key}`) })),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
        <p className="text-body font-semibold">{t("title")}</p>
        <div className="order-last w-full lg:order-none lg:w-auto">
          <HqNav items={items} label={t("nav.label")} />
        </div>
        <div className="ml-auto">
          <SignOutButton label={t("shell.signOut")} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-320 flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
