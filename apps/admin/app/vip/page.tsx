import { getVipView } from "@namitiszunk/core/bar-view";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { VipBoard } from "./vip-board";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.vipView");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * The VIP host's phone (T-055). A bartender's PIN gets 403 here (the module needs
 * order.viewTakeOutList); a signed-in manager sees the list and can set the phone up.
 */
export default async function VipPage() {
  const { actor, venue } = await requireAdminModule("vipView");
  const view = await getVipView(actor, venue.id, new Date());
  return (
    <VipBoard
      venueId={venue.id}
      onDevice={actor.kind === "staff"}
      initial={view}
    />
  );
}
