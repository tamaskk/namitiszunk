import type { HqModuleKey } from "@namitiszunk/core/hq";
import { EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";

import { requireHqPage } from "@/lib/hq-context";

/** An HQ module whose own task (T-067–T-073) is still ahead; the permission check is already real. */
export async function ModulePlaceholder({
  moduleKey,
}: {
  moduleKey: HqModuleKey;
}) {
  await requireHqPage(moduleKey);
  const t = await getTranslations("hq");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t(`nav.${moduleKey}`)}</h1>
      <EmptyState message={t("shell.comingSoon")} />
    </div>
  );
}
