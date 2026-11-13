import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getAdminContext } from "@/lib/admin-context";

import { TwoFactorSetup } from "./two-factor-setup";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.profile");
  return { title: t("title") };
}

/** The signed-in member's own profile (T-050): turning on two-step sign-in. */
export default async function ProfilePage() {
  const [{ actor }, t] = await Promise.all([
    getAdminContext(),
    getTranslations("admin.profile"),
  ]);
  // A PIN holder on a bar tablet acts through the venue's device session, not their own account.
  if (actor.kind !== "user") forbidden();

  return (
    <div className="flex max-w-content flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      <section
        aria-labelledby="two-factor"
        className="flex max-w-120 flex-col gap-4 rounded-lg border border-border bg-surface p-6"
      >
        <h2 id="two-factor" className="text-h3">
          {t("twoFactor.title")}
        </h2>
        {/* In the Admin a verified session means 2FA is on: sign-in asks for the code once it is. */}
        {actor.twoFactorVerified ? (
          <p className="text-body">{t("twoFactor.on")}</p>
        ) : (
          <TwoFactorSetup />
        )}
      </section>
    </div>
  );
}
