import type { AdminModuleKey } from "@namitiszunk/core/admin";
import { Button, EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireAdminModule } from "@/lib/admin-context";

/**
 * A module whose task (T-051 to T-065) has not landed yet. The route and its permission check
 * exist already, so a role-gated URL answers 403. Each module is its own static route: a dynamic
 * segment would stream a prerendered shell first and lose the 403 status in production.
 */
export async function ModulePlaceholder({
  moduleKey,
}: {
  moduleKey: AdminModuleKey;
}) {
  await requireAdminModule(moduleKey);
  const t = await getTranslations("admin");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t(`nav.${moduleKey}`)}</h1>
      <EmptyState
        message={t("shell.comingSoon")}
        action={
          moduleKey === "dashboard" ? undefined : (
            <Button asChild>
              <Link href="/">{t("shell.backToDashboard")}</Link>
            </Button>
          )
        }
      />
    </div>
  );
}
