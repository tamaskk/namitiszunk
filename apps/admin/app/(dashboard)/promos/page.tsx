import { listPromos } from "@namitiszunk/core/promos";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { PromosManager } from "./promos-manager";

export const instant = false;

export default async function PromosPage() {
  const { actor, venue } = await requireAdminModule("promos");
  const [promos, t] = await Promise.all([
    listPromos(actor, venue.id),
    getTranslations("admin"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("nav.promos")}</h1>
        <p className="text-small text-text-muted">{t("promos.intro")}</p>
      </div>
      <PromosManager promos={promos} />
    </div>
  );
}
