import { Button, EmptyState } from "@namitiszunk/ui";
import { getLocale, getTranslations } from "next-intl/server";

// A stale or mistyped link, e.g. an order status URL with a wrong token (T-043).
export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-6">
      <EmptyState
        message={t("message")}
        action={
          <Button asChild>
            <a href={`/${locale}`}>{t("action")}</a>
          </Button>
        }
      />
    </main>
  );
}
