import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("admin.settings");
  return (
    <p role="status" className="text-body text-text-muted">
      {t("loading")}
    </p>
  );
}
