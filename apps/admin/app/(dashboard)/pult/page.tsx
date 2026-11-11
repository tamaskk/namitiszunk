import { getBarPicker } from "@namitiszunk/core/bar-view";
import { Button, EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { switchStaffAction } from "../../pin/actions";
import { RegisterDeviceButton } from "./register-device-button";

export const instant = false;

/**
 * The bar view's entry (T-054). A Manager or Owner turns this browser into a bar tablet for one of
 * the bars; on a tablet, the PIN holder sees who is signed in and can hand over.
 */
export default async function BarViewEntryPage() {
  const { actor, venue } = await requireAdminModule("barView");
  const [{ bars, staffName }, t] = await Promise.all([
    getBarPicker(actor, venue.id),
    getTranslations("admin.barView"),
  ]);
  const onDevice = actor.kind === "staff";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">{t("title")}</h1>
        {onDevice && (
          <form action={switchStaffAction} className="ml-auto">
            <Button type="submit" variant="secondary">
              {t("switchStaff", { name: staffName ?? "" })}
            </Button>
          </form>
        )}
      </div>
      <p className="text-body text-text-muted">
        {onDevice ? t("deviceHint") : t("setUpHint")}
      </p>
      {bars.length === 0 ? (
        <EmptyState message={t("noBars")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {bars.map((bar) => (
            <li
              key={bar.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <span className="flex-1 text-body font-semibold">{bar.name}</span>
              {!onDevice && (
                <RegisterDeviceButton barId={bar.id} barName={bar.name} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
