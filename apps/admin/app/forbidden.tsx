import { Button, EmptyState } from "@namitiszunk/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// forbidden() from requireAdminModule renders this with a 403 status.
export default async function Forbidden() {
  const t = await getTranslations("admin.shell");
  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col justify-center gap-4 px-4">
      <h1 className="text-h2">{t("forbiddenTitle")}</h1>
      <EmptyState
        message={t("forbiddenBody")}
        action={
          <Button asChild>
            <Link href="/">{t("backToDashboard")}</Link>
          </Button>
        }
      />
    </main>
  );
}
