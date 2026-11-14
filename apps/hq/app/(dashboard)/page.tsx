import { EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";

import { getHqActor } from "@/lib/hq-context";

export const instant = false;

// The HQ's landing page; the modules' own figures come with their tasks (T-067–T-073).
export default async function HqHomePage() {
  const [, t] = await Promise.all([getHqActor(), getTranslations("hq")]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t("nav.home")}</h1>
      <EmptyState message={t("shell.homeBody")} />
    </div>
  );
}
