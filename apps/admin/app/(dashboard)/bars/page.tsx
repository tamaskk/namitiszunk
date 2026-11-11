import { listBars } from "@namitiszunk/core/bars";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { BarsEditor } from "./bars-editor";

export const instant = false;

export default async function BarsPage() {
  const { actor, venue } = await requireAdminModule("bars");
  const [bars, t] = await Promise.all([
    listBars(actor, venue.id),
    getTranslations("admin"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("nav.bars")}</h1>
        <p className="text-small text-text-muted">{t("bars.printHint")}</p>
      </div>
      <BarsEditor bars={bars} />
    </div>
  );
}
