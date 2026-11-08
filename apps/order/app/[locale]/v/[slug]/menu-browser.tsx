"use client";

import type { PublicMenu, PublicMenuItem } from "@namitiszunk/core/menu";
import { formatHuf } from "@namitiszunk/i18n";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  focusRing,
  Input,
} from "@namitiszunk/ui";
import type { VenueStatusResponse } from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  cartSubtotalHuf,
  itemCount,
  useCart,
  withLine,
  type CartLine,
} from "@/components/cart/use-cart";

// The sheets (Radix Dialog) load after first paint, keeping the menu inside its JS budget.
// Neither has server markup: the cart is empty until localStorage is read, the sheet starts closed.
const Cart = dynamic(
  () => import("@/components/cart/cart").then((m) => m.Cart),
  { ssr: false },
);
const ProductSheet = dynamic(
  () =>
    import("@/components/product-sheet/product-sheet").then(
      (m) => m.ProductSheet,
    ),
  { ssr: false },
);

const POLL_MS = 30_000;
const EAGER_IMAGES = 4;
// The sticky category bar's height (48px pill + 2 × 8px padding + border, rounded up): sections
// scroll to just below it, and the scroll-spy band starts there.
const NAV_OFFSET_PX = 80;

type Props = {
  slug: string;
  venueId: string;
  barId: string | null;
  /** The QR's zone, re-checked on the server at "Tovább". */
  zoneId?: string;
  /** The menu URL's query, kept on the way to checkout. */
  search: string;
  maxItemsPerOrder: number;
  categories: PublicMenu["categories"];
  initialStatus: VenueStatusResponse;
  /** When the server read `initialStatus`, in epoch ms. */
  renderedAt: number;
};

// Accent- and case-insensitive, so "palinka" finds "Pálinka".
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Polls the live status every 30 s while the tab is visible, and once on coming back.
 * A failed poll or an `offline` event keeps the last status and flags it as possibly stale.
 */
function useVenueStatus(
  slug: string,
  barId: string | null,
  initial: VenueStatusResponse,
  renderedAt: number,
) {
  // `at` turns pausedUntil into minutes without reading the clock during render.
  const [live, setLive] = useState({
    status: initial,
    at: renderedAt,
    stale: false,
  });
  useEffect(() => {
    const url = `/api/venues/${slug}/status${barId ? `?bar=${barId}` : ""}`;
    let active = true;
    const markStale = () =>
      active && setLive((current) => ({ ...current, stale: true }));
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`status ${response.status}`);
        const body = (await response.json()) as { data: VenueStatusResponse };
        if (active)
          setLive({ status: body.data, at: Date.now(), stale: false });
      } catch {
        // Offline or a failed request: keep the last status, say it may be old, retry next tick.
        markStale();
      }
    };
    const onVisible = () => void poll();
    const timer = setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("offline", markStale);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("offline", markStale);
    };
  }, [slug, barId]);
  return live;
}

/** The category whose section is topmost in the band just under the sticky bar. */
function useActiveCategory(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (top) setActiveId(top.target.id.slice(2));
      },
      { rootMargin: `-${NAV_OFFSET_PX}px 0px -70% 0px` },
    );
    for (const id of ids) {
      const section = document.getElementById(`c-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);
  // A search can filter the active category out; fall back to the first one left.
  return activeId && ids.includes(activeId) ? activeId : ids[0];
}

export function MenuBrowser({
  slug,
  venueId,
  barId,
  zoneId,
  search,
  maxItemsPerOrder,
  categories,
  initialStatus,
  renderedAt,
}: Props) {
  const t = useTranslations("order.menu");
  const tCart = useTranslations("order.cart");
  const { status, at, stale } = useVenueStatus(
    slug,
    barId,
    initialStatus,
    renderedAt,
  );
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<PublicMenuItem | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const { lines, update } = useCart(venueId);
  const count = itemCount(lines);
  const remaining = maxItemsPerOrder - count;
  const addLine = (line: CartLine) =>
    update((current) => withLine(current, line));
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const soldOut = useMemo(
    () => new Set(status.soldOutItemIds),
    [status.soldOutItemIds],
  );
  const visible = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return categories;
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          fold(`${item.name} ${item.description ?? ""}`).includes(needle),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, query]);
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const activeId = useActiveCategory(visibleIds);

  // Keeps the active pill in view as the guest scrolls.
  useEffect(() => {
    const nav = navRef.current;
    const pill = nav?.querySelector<HTMLElement>(
      `[data-category="${activeId}"]`,
    );
    if (nav && pill) {
      nav.scrollTo({
        left: pill.offsetLeft - 16,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }, [activeId]);

  const pausedMinutes = status.pausedUntil
    ? Math.max(1, Math.ceil((Date.parse(status.pausedUntil) - at) / 60_000))
    : 0;

  if (categories.length === 0) {
    return <EmptyState className="m-4" message={t("empty")} />;
  }

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  let imageIndex = 0;
  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-2">
        {/* The one live region: status, wait and the paused, closed or offline note. */}
        <div aria-live="polite" className="flex flex-col gap-4">
          <p className="text-small text-text-muted">
            <span
              className={cn(
                "font-medium",
                status.status === "open" && "text-success",
                status.status === "paused" && "text-warning",
                status.status === "closed" && "text-danger",
              )}
            >
              {status.status === "open" && t("statusOpen")}
              {status.status === "paused" &&
                t("statusPaused", { minutes: pausedMinutes })}
              {status.status === "closed" && t("statusClosed")}
            </span>
            {status.status === "open" &&
              status.estimatedWaitMinutes !== null && (
                <> · {t("wait", { minutes: status.estimatedWaitMinutes })}</>
              )}
          </p>
          {stale && (
            <p className="rounded-lg border border-warning bg-surface p-4 text-body">
              {t("offline")}
            </p>
          )}
          {status.status !== "open" && (
            <p className="rounded-lg border border-warning bg-surface p-4 text-body">
              {status.status === "paused" ? t("pausedNote") : t("closedNote")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="menu-search" className="text-small font-medium">
            {t("searchLabel")}
          </label>
          <Input
            ref={searchRef}
            id="menu-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
          />
        </div>
      </div>

      <nav
        ref={navRef}
        aria-label={t("categories")}
        className="sticky top-0 z-10 mt-4 flex gap-2 overflow-x-auto border-b border-border bg-bg px-4 py-2"
      >
        {visible.map((category) => {
          const active = category.id === activeId;
          return (
            <a
              key={category.id}
              href={`#c-${category.id}`}
              data-category={category.id}
              aria-current={active ? "location" : undefined}
              className={cn(
                "inline-flex h-12 shrink-0 items-center rounded-full border bg-surface px-4 text-small font-medium whitespace-nowrap transition-colors duration-150",
                active
                  ? "border-primary text-primary ring-1 ring-primary"
                  : "border-border text-text",
                focusRing,
              )}
            >
              {category.name}
            </a>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          className="m-4"
          message={t("noResults", { query: query.trim() })}
          action={
            <Button variant="secondary" onClick={clearSearch}>
              {t("clearSearch")}
            </Button>
          }
        />
      ) : (
        visible.map((category) => (
          <section
            key={category.id}
            id={`c-${category.id}`}
            aria-labelledby={`h-${category.id}`}
            style={{ scrollMarginTop: NAV_OFFSET_PX }}
            className="px-4 pt-8"
          >
            <h2 id={`h-${category.id}`} className="mb-4 text-h3">
              {category.name}
            </h2>
            <ul className="flex flex-col gap-4">
              {category.items.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  soldOut={soldOut.has(item.id)}
                  // A paused or closed venue takes no items; the live region above says why.
                  blocked={remaining < 1 || status.status !== "open"}
                  onOpen={(opener) => {
                    openerRef.current = opener;
                    setOpenItem(item);
                  }}
                  eager={item.imageUrl ? imageIndex++ < EAGER_IMAGES : false}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <ProductSheet
        item={openItem}
        remaining={remaining}
        maxItemsPerOrder={maxItemsPerOrder}
        status={status.status}
        onAdd={addLine}
        onClose={() => setOpenItem(null)}
        returnFocus={() => openerRef.current?.focus()}
      />
      <Cart
        lines={lines}
        update={update}
        slug={slug}
        barId={barId}
        zoneId={zoneId}
        search={search}
        soldOut={soldOut}
        status={status.status}
        maxItemsPerOrder={maxItemsPerOrder}
        hidden={openItem !== null}
      />
      {/* Always mounted (the cart sheet loads later), so every change to the cart is announced. */}
      <p role="status" className="sr-only">
        {count > 0 &&
          tCart("open", {
            count,
            subtotal: formatHuf(cartSubtotalHuf(lines)),
          })}
      </p>
    </>
  );
}

function ProductCard({
  item,
  soldOut,
  blocked,
  onOpen,
  eager,
}: {
  item: PublicMenuItem;
  soldOut: boolean;
  blocked: boolean;
  onOpen: (opener: HTMLElement) => void;
  eager: boolean;
}) {
  const tProduct = useTranslations("order.product");
  const t = useTranslations("order.menu");
  // Only the picture is dimmed; text stays AA on the surface.
  const picture = cn("size-16 shrink-0 rounded-sm", soldOut && "opacity-50");
  return (
    <li className="flex gap-4 rounded-lg border border-border bg-surface p-6">
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt=""
          width={64}
          height={64}
          loading={eager ? "eager" : "lazy"}
          className={cn(picture, "object-cover")}
        />
      ) : (
        // No photo yet: the item's initial on the surface, so the row keeps its shape.
        <div
          aria-hidden
          className={cn(
            picture,
            "flex items-center justify-center border border-border bg-bg text-h3 text-text-muted",
          )}
        >
          {[...item.name][0]}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "text-body font-semibold",
              soldOut && "text-text-muted",
            )}
          >
            {item.name}
          </h3>
          <span className="shrink-0 text-body tabular-nums">
            {formatHuf(item.priceHuf)}
          </span>
        </div>
        {item.description && (
          <p className="text-small text-text-muted">{item.description}</p>
        )}
        {soldOut ? (
          <Badge status="neutral">{t("soldOut")}</Badge>
        ) : (
          <Button
            variant="secondary"
            className="self-end"
            disabled={blocked}
            aria-label={tProduct("addLabel", { name: item.name })}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            {tProduct("add")}
          </Button>
        )}
      </div>
    </li>
  );
}
