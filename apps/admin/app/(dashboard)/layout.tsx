import {
  adminModules,
  canOpenModule,
  listAdminNotifications,
} from "@namitiszunk/core/admin";
import { can } from "@namitiszunk/core/auth";
import { Button, EmptyState } from "@namitiszunk/ui";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { BottomNav, SideNav } from "@/components/shell/nav";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { PauseSwitch } from "@/components/shell/pause-switch";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { VenueSwitcher } from "@/components/shell/venue-switcher";
import { getAdminContext } from "@/lib/admin-context";

// Every Admin page is per user behind a session, so the shell renders on each request.
export const instant = false;

/**
 * The Admin shell (T-050): side navigation from lg, a bottom bar on phones, and the top bar with the
 * venue switcher, the venue-wide pause, notifications and sign-out. Menu items follow the role,
 * and every page checks again with requireAdminModule: hiding a link is never the guard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { actor, venues, venue } = await getAdminContext();
  const t = await getTranslations("admin");

  if (!venue) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-4 px-4">
        <h1 className="text-h2">{t("shell.noVenueTitle")}</h1>
        <EmptyState
          message={t("shell.noVenueBody")}
          action={<SignOutButton label={t("shell.signOut")} />}
        />
      </main>
    );
  }

  const items = adminModules
    .filter((m) => canOpenModule(actor, m.key, venue.id))
    .map((m) => ({ key: m.key, path: m.path, label: t(`nav.${m.key}`) }));
  const notifications = canOpenModule(actor, "orders", venue.id)
    ? await listAdminNotifications(actor, { venueId: venue.id })
    : null;
  const paused = venue.ordersPausedAt !== null;

  return (
    <div className="flex min-h-dvh">
      <SideNav items={items} label={t("nav.label")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-bg px-4 py-2">
          {venues.length > 1 ? (
            <VenueSwitcher venues={venues} current={venue.id} />
          ) : (
            <p className="min-w-0 truncate text-small font-medium">
              {venue.name}
            </p>
          )}
          <div className="ml-auto flex items-center gap-1">
            <PauseSwitch
              venueId={venue.id}
              paused={paused}
              canChange={can(actor, "venue.pauseOrders", { venueId: venue.id })}
            />
            {notifications && <NotificationsBell items={notifications} />}
            {actor.kind === "user" && (
              <Button
                asChild
                variant="ghost"
                className="min-w-12 px-3"
                aria-label={t("shell.profile")}
              >
                <Link href="/profile">
                  <UserRound aria-hidden />
                </Link>
              </Button>
            )}
            <SignOutButton label={t("shell.signOut")} />
          </div>
        </header>
        {/* An open-ended pause is easy to forget: it stays on every page until switched back. */}
        {paused && (
          <p
            role="status"
            className="border-b border-warning bg-surface px-4 py-3 text-small text-warning"
          >
            {t("shell.pausedBanner")}
          </p>
        )}
        <main className="mx-auto w-full max-w-320 flex-1 px-4 pt-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav
        items={items}
        label={t("nav.label")}
        moreLabel={t("nav.more")}
        closeLabel={t("shell.close")}
      />
    </div>
  );
}
