import { EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";

// forbidden() renders this with a 403 status; proxy.ts sends it for a full page load.
export default async function Forbidden() {
  const t = await getTranslations("hq.shell");
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-4 px-4">
      <h1 className="text-h2">{t("forbiddenTitle")}</h1>
      <EmptyState
        message={t("forbiddenBody")}
        // A club member signed in here by mistake: leaving lets them sign in with the right account.
        action={<SignOutButton label={t("signOut")} />}
      />
    </main>
  );
}
