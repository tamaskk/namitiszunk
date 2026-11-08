import { getVenueStatus } from "@namitiszunk/core/menu";
import type { Locale } from "@namitiszunk/i18n";
import { buttonVariants, EmptyState } from "@namitiszunk/ui";
import {
  objectIdSchema,
  toVenueStatusResponse,
  venueSlugSchema,
} from "@namitiszunk/validators";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ensureDb } from "@/lib/db";
import { getMenu } from "@/lib/menu-cache";

import { CheckoutForm } from "./checkout-form";

// A malformed QR parameter is dropped, as on the menu.
const idParam = (value: string | string[] | undefined) =>
  objectIdSchema.safeParse(value).success ? (value as string) : undefined;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/v/[slug]/checkout">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "order.checkout",
  });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Request time, not prerender time: whether the bar takes orders right now. */
async function loadLiveStatus(slug: string, barId?: string) {
  await connection();
  await ensureDb();
  const at = Date.now();
  const status = await getVenueStatus({ slug, barId, now: new Date(at) });
  return status && { status: toVenueStatusResponse(status), at };
}

// Checkout and payment (T-042): the cart from the menu, priced by the server, paid with Stripe.
export default async function CheckoutPage({
  params,
  searchParams,
}: PageProps<"/[locale]/v/[slug]/checkout">) {
  const { locale: localeParam, slug } = await params;
  const locale = localeParam as Locale;
  setRequestLocale(locale);
  if (!venueSlugSchema.safeParse(slug).success) notFound();

  const query = await searchParams;
  const zoneId = idParam(query.zone);
  const menu = await getMenu(slug, locale, zoneId, idParam(query.bar));
  if (!menu) notFound();
  const live = await loadLiveStatus(slug, menu.bar?.id);
  if (!live) notFound();

  const t = await getTranslations("order.checkout");
  // Back to the same QR menu: bar and zone stay in the URL.
  const search = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();
  const menuHref = `/${locale}/v/${encodeURIComponent(slug)}${search ? `?${search}` : ""}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-120 flex-col gap-6 bg-bg p-4 pb-32 text-text">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2">{t("title")}</h1>
        <p className="text-body text-text-muted">{menu.venue.name}</p>
      </header>
      {menu.bar ? (
        <CheckoutForm
          venueId={menu.venue.id}
          bar={menu.bar}
          zoneId={zoneId}
          slug={slug}
          initialStatus={live.status}
          renderedAt={live.at}
          menuHref={menuHref}
          publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
        />
      ) : (
        <EmptyState
          message={t("noBar")}
          action={
            <Link
              href={menuHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("back")}
            </Link>
          }
        />
      )}
    </main>
  );
}
