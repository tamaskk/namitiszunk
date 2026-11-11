import { listStaff } from "@namitiszunk/core/staff";
import { getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

import { StaffManager } from "./staff-manager";

export const instant = false;

/** Staff (T-057): members with their role and last action, PIN staff, invites and signed-in devices. */
export default async function StaffPage() {
  const { actor, venue } = await requireAdminModule("staff");
  const [staff, t] = await Promise.all([
    listStaff(actor, venue.id),
    getTranslations("admin"),
  ]);
  return (
    <div className="flex max-w-content flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("nav.staff")}</h1>
        <p className="text-small text-text-muted">{t("staff.intro")}</p>
      </div>
      <StaffManager {...staff} />
    </div>
  );
}
