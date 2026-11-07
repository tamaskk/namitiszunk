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
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 30_000;
const EAGER_IMAGES = 4;

type Props = {
  slug: string;
  barId: string | null;
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

/** Polls the live status every 30 s while the tab is visible, and once on coming back. */
function useVenueStatus(
  slug: string,
  barId: string | null,
  initial: VenueStatusResponse,
  renderedAt: number,
) {
  // `at` turns pausedUntil into minutes without reading the clock during render.
  const [live, setLive] = useState({ status: initial, at: renderedAt });
  useEffect(() => {
    const url = `/api/venues/${slug}/status${barId ? `?bar=${barId}` : ""}`;
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { data: VenueStatusResponse };
        if (active) setLive({ status: body.data, at: Date.now() });
      } catch {
        // Offline or a dropped request: keep the last status, the next poll tries again.
      }
    };
    const onVisibility = () => void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [slug, barId]);
  return live;
}

/** Marks the category whose section is at the top of the screen. */
function useActiveCategory(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.find((entry) => entry.isIntersecting);
        if (top) setActiveId(top.target.id.slice(2));
      },
      // A thin band under the sticky category bar.
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const id of ids) {
      const section = document.getElementById(`c-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);
  return activeId;
}

export function MenuBrowser({
  slug,
  barId,
  categories,
  initialStatus,
  renderedAt,
}: Props) {
  const t = useTranslations("order.menu");
  const { status, at } = useVenueStatus(slug, barId, initialStatus, renderedAt);
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);

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
    const pill = navRef.current?.querySelector<HTMLElement>(
      `[data-category="${activeId}"]`,
    );
    if (pill && navRef.current) {
      navRef.current.scrollTo({ left: pill.offsetLeft - 16 });
    }
  }, [activeId]);

  const pausedMinutes = status.pausedUntil
    ? Math.max(1, Math.ceil((Date.parse(status.pausedUntil) - at) / 60_000))
    : 0;

  if (categories.length === 0) {
    return <EmptyState className="m-4" message={t("empty")} />;
  }

  let imageIndex = 0;
  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-2">
        <p className="text-small text-text-muted" aria-live="polite">
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
          {status.status === "open" && status.estimatedWaitMinutes !== null && (
            <> · {t("wait", { minutes: status.estimatedWaitMinutes })}</>
          )}
        </p>
        {status.status !== "open" && (
          <p
            role="status"
            className="rounded-lg border border-warning bg-surface p-4 text-body"
          >
            {status.status === "paused" ? t("pausedNote") : t("closedNote")}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="menu-search" className="text-small font-medium">
            {t("searchLabel")}
          </label>
          <Input
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
        {visible.map((category) => (
          <a
            key={category.id}
            href={`#c-${category.id}`}
            data-category={category.id}
            aria-current={category.id === activeId ? "true" : undefined}
            className={cn(
              "inline-flex h-12 shrink-0 items-center rounded-full border px-4 text-small font-medium whitespace-nowrap transition-colors duration-150",
              category.id === activeId
                ? "border-primary bg-primary text-on-primary"
                : "border-border bg-surface text-text",
              focusRing,
            )}
          >
            {category.name}
          </a>
        ))}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          className="m-4"
          message={t("noResults", { query: query.trim() })}
        />
      ) : (
        visible.map((category) => (
          <section
            key={category.id}
            id={`c-${category.id}`}
            aria-labelledby={`h-${category.id}`}
            className="scroll-mt-20 px-4 pt-8"
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
                  eager={item.imageUrl ? imageIndex++ < EAGER_IMAGES : false}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function ProductCard({
  item,
  soldOut,
  eager,
}: {
  item: PublicMenuItem;
  soldOut: boolean;
  eager: boolean;
}) {
  const t = useTranslations("order.menu");
  return (
    <li
      className={cn(
        "flex gap-4 rounded-lg border border-border bg-surface p-6",
        soldOut && "opacity-50",
      )}
    >
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt=""
          width={64}
          height={64}
          loading={eager ? "eager" : "lazy"}
          className="size-16 shrink-0 rounded-sm object-cover"
        />
      ) : (
        // No photo yet: the item's initial on the surface, so the row keeps its shape.
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-sm border border-border bg-bg text-h3 text-text-muted"
        >
          {item.name.charAt(0)}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-body font-semibold">{item.name}</h3>
          <span className="shrink-0 text-body tabular-nums">
            {formatHuf(item.priceHuf)}
          </span>
        </div>
        {item.description && (
          <p className="text-small text-text-muted">{item.description}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          {soldOut && (
            <Badge className="border-border bg-transparent text-text-muted">
              {t("soldOut")}
            </Badge>
          )}
          {/* shortcut: the cart is T-041; until then the button only shows where adding will be. */}
          <Button
            variant="secondary"
            disabled
            aria-label={t("addLabel", { name: item.name })}
          >
            {t("add")}
          </Button>
        </div>
      </div>
    </li>
  );
}
