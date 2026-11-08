import type { Locale } from "@namitiszunk/i18n";
import { buttonVariants, EmptyState } from "@namitiszunk/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

// shortcut: placeholder until T-042, which builds the checkout and payment here.
export default async function CheckoutPage({
  params,
  searchParams,
}: PageProps<"/[locale]/v/[slug]/checkout">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("order.checkout");
  // Back to the same QR menu: bar and zone stay in the URL.
  const search = new URLSearchParams(
    Object.entries(await searchParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();

  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col gap-4 bg-bg p-4 text-text">
      <h1 className="text-h2">{t("title")}</h1>
      <EmptyState
        message={t("placeholder")}
        action={
          <Link
            href={`/${locale}/v/${encodeURIComponent(slug)}${search ? `?${search}` : ""}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("back")}
          </Link>
        }
      />
    </main>
  );
}
