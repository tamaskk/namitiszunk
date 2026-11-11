import { getBarPicker, getBarView } from "@namitiszunk/core/bar-view";
import { AppError } from "@namitiszunk/core/errors";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";

import { requireAdminModule } from "@/lib/admin-context";

import { BarBoard } from "./bar-board";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.barView");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The bar tablet's board (T-054): rendered with the list, then kept live in the browser. */
export default async function BarBoardPage({
  params,
}: {
  params: Promise<{ barId: string }>;
}) {
  const [{ barId }, { actor, venue }] = await Promise.all([
    params,
    requireAdminModule("barView"),
  ]);
  let view: Awaited<ReturnType<typeof getBarView>>;
  try {
    view = await getBarView(actor, barId, new Date());
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403) forbidden();
    throw error;
  }
  const { staffName } = await getBarPicker(actor, venue.id);

  return <BarBoard venueId={venue.id} staffName={staffName} initial={view} />;
}
