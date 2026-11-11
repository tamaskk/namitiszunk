import { Button } from "@namitiszunk/ui";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireAdminModule } from "@/lib/admin-context";

import { ImportForm } from "./import-form";

export const instant = false;

export default async function MenuImportPage() {
  await requireAdminModule("menu");
  const t = await getTranslations("admin.menuImport");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/menu">
          <ArrowLeft aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <h1 className="text-h1">{t("title")}</h1>
      <p className="text-body text-text-muted">{t("intro")}</p>
      <ImportForm />
    </div>
  );
}
