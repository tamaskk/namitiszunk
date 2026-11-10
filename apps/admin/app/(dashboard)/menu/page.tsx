import { getAdminMenu } from "@namitiszunk/core/menu";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { MenuEditor } from "./menu-editor";

export const instant = false;

export default async function MenuPage() {
  const { actor, venue } = await requireAdminModule("menu");
  const [menu, t] = await Promise.all([
    getAdminMenu(actor, venue.id),
    getTranslations("admin"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t("nav.menu")}</h1>
      <MenuEditor menu={menu} venueId={venue.id} slug={venue.slug} />
    </div>
  );
}
