import { getVenueStatus } from "@namitiszunk/core/menu";
import type { Locale } from "@namitiszunk/i18n";
import { cn, focusRing } from "@namitiszunk/ui";
import {
  objectIdSchema,
  venueSlugSchema,
  type VenueStatusResponse,
} from "@namitiszunk/validators";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { trackMenuViewed } from "@/lib/analytics";
import { ensureDb } from "@/lib/db";
import { getMenu } from "@/lib/menu-cache";

import { AgeGate } from "./age-gate";
import { ageGatePrePaintScript } from "./age-gate-ids";
import { MenuBrowser } from "./menu-browser";

// A malformed or tampered QR parameter is dropped, never an error: the guest still gets the menu.
const idParam = (value: string | string[] | undefined) =>
  objectIdSchema.safeParse(value).success ? (value as string) : undefined;

/** Uncached, so a sold-out item shows as soon as the page is loaded again. */
async function loadLiveStatus(slug: string, barId?: string) {
  // Request time, not prerender time: the status is live data.
  await connection();
  await ensureDb();
  const now = new Date();
  const status = await getVenueStatus({ slug, barId, now });
  if (!status) return null;
  const response: VenueStatusResponse = {
    ...status,
    pausedUntil: status.pausedUntil?.toISOString() ?? null,
  };
  return { status: response, at: now.getTime() };
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/v/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "order",
  });
  if (!venueSlugSchema.safeParse(slug).success)
    return { title: t("menuTitle") };
  const menu = await getMenu(slug, locale as Locale);
  return {
    title: menu ? `${menu.venue.name} · ${t("menuTitle")}` : t("menuTitle"),
  };
}

export default async function MenuPage({
  params,
  searchParams,
}: PageProps<"/[locale]/v/[slug]">) {
  const { locale: localeParam, slug } = await params;
  // The layout has already sent unknown locales to notFound().
  const locale = localeParam as Locale;
  setRequestLocale(locale);
  if (!venueSlugSchema.safeParse(slug).success) notFound();

  const query = await searchParams;
  const menu = await getMenu(
    slug,
    locale,
    idParam(query.zone),
    idParam(query.bar),
  );
  if (!menu) notFound();

  const live = await loadLiveStatus(slug, menu.bar?.id);
  if (!live) notFound();

  trackMenuViewed({
    venueId: menu.venue.id,
    barId: menu.bar?.id ?? null,
    source: typeof query.q === "string" ? query.q.slice(0, 64) : undefined,
  });

  const t = await getTranslations("order.menu");
  const otherLocale: Locale = locale === "hu" ? "en" : "hu";
  const search = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ).toString();

  return (
    <main className="mx-auto min-h-dvh max-w-120 bg-bg pb-32 text-text">
      <AgeGate>
        <header>
          {menu.venue.coverUrl && (
            <div className="relative aspect-3/1 w-full">
              <Image
                src={menu.venue.coverUrl}
                alt=""
                fill
                priority
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover"
              />
            </div>
          )}
          <div className="flex items-start gap-4 px-4 pt-4">
            {menu.venue.logoUrl && (
              <Image
                src={menu.venue.logoUrl}
                alt={t("logoAlt", { name: menu.venue.name })}
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-full border border-border object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-h2">{menu.venue.name}</h1>
              {menu.bar && (
                <p className="text-small text-text-muted">
                  {t("bar", { name: menu.bar.name })}
                </p>
              )}
            </div>
            <Link
              href={`/${otherLocale}/v/${slug}${search ? `?${search}` : ""}`}
              hrefLang={otherLocale}
              lang={otherLocale}
              aria-label={t("otherLanguageLabel")}
              className={cn(
                "inline-flex h-12 shrink-0 items-center rounded-md px-4 text-small font-medium text-text hover:bg-surface",
                focusRing,
              )}
            >
              {t("otherLanguage")}
            </Link>
          </div>
        </header>

        <MenuBrowser
          slug={slug}
          venueId={menu.venue.id}
          barId={menu.bar?.id ?? null}
          zoneId={idParam(query.zone)}
          search={search}
          maxItemsPerOrder={menu.venue.maxItemsPerOrder}
          categories={menu.categories}
          initialStatus={live.status}
          renderedAt={live.at}
        />
      </AgeGate>
      <script dangerouslySetInnerHTML={{ __html: ageGatePrePaintScript }} />
    </main>
  );
}
