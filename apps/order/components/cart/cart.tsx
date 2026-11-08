"use client";

import type { CartLineProblem } from "@namitiszunk/core/cart";
import { formatHuf } from "@namitiszunk/i18n/format";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@namitiszunk/ui";
import type { VenueStatusResponse } from "@namitiszunk/validators";
import { MAX_QUANTITY_PER_LINE } from "@namitiszunk/validators/cart-limits";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { validateCartAction } from "@/app/[locale]/v/[slug]/actions";

import { cartSubtotalHuf, itemCount, type CartLine } from "./use-cart";

type Props = {
  lines: CartLine[];
  update: (change: (current: CartLine[]) => CartLine[]) => void;
  slug: string;
  barId: string | null;
  zoneId?: string;
  /** The menu URL's query (bar, zone), kept on the way to checkout. */
  search: string;
  /** Live sold-out ids from the venue status poll. */
  soldOut: ReadonlySet<string>;
  /** The live venue status: "Tovább" needs an open venue. */
  status: VenueStatusResponse["status"];
  maxItemsPerOrder: number;
  /** Another sheet is open: the bar steps aside, one primary action at a time. */
  hidden: boolean;
};

/** The floating cart button and the cart sheet (T-041); tip, fees and the total belong to checkout (T-042). */
export function Cart({
  lines,
  update,
  slug,
  barId,
  zoneId,
  search,
  soldOut,
  status,
  maxItemsPerOrder,
  hidden,
}: Props) {
  const t = useTranslations("order.cart");
  const tMenu = useTranslations("order.menu");
  const locale = useLocale();
  const router = useRouter();
  const notesRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<"error" | "rateLimited" | "invalid">();

  const count = itemCount(lines);
  const subtotal = formatHuf(cartSubtotalHuf(lines));
  const atLimit = count >= maxItemsPerOrder;
  const closedReason = status === "open" ? null : t(status);
  const barLabel =
    status === "paused"
      ? "openPaused"
      : status === "closed"
        ? "openClosed"
        : "open";

  const setQuantity = (key: string, quantity: number) =>
    update((current) =>
      current.flatMap((line) =>
        line.key !== key ? [line] : quantity > 0 ? [{ ...line, quantity }] : [],
      ),
    );

  const noteFor = (problem: CartLineProblem, line: CartLine) => {
    switch (problem.code) {
      case "sold_out":
        return t("soldOut", { name: line.name });
      case "price_changed":
        return t("priceChanged", {
          name: line.name,
          price: formatHuf(problem.unitPriceHuf),
        });
      case "invalid_options":
        return t("invalidOptions", { name: line.name });
      default:
        return t("unavailable", { name: line.name });
    }
  };

  const goToCheckout = () =>
    router.push(`/${locale}/v/${slug}/checkout${search ? `?${search}` : ""}`);

  const proceed = async () => {
    const sent = lines;
    setBusy(true);
    setError(undefined);
    setNotes([]);
    try {
      const result = await validateCartAction({
        slug,
        barId: barId ?? undefined,
        zoneId,
        items: sent.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          modifierIds: line.modifierIds,
          unitPriceHuf: line.unitPriceHuf,
        })),
      });
      if ("error" in result) {
        const { code } = result.error;
        // The pre-check is a courtesy: when it is throttled, checkout (createOrder) still checks everything.
        if (code === "rate_limited" || code === "client_unknown") {
          goToCheckout();
          return;
        }
        setError(code === "validation_failed" ? "invalid" : "error");
        return;
      }
      const { problems, overLimit } = result.data;
      if (problems.length === 0 && !overLimit) {
        goToCheckout();
        return;
      }
      // Problems point at the lines as sent; match them by key, the cart may have moved on.
      const byKey = new Map(
        problems.map((problem) => [sent[problem.index]!.key, problem]),
      );
      update((current) =>
        current.flatMap((line) => {
          const problem = byKey.get(line.key);
          if (!problem) return [line];
          return problem.code === "price_changed"
            ? [{ ...line, unitPriceHuf: problem.unitPriceHuf }]
            : [];
        }),
      );
      setNotes([
        ...problems.map((problem) => noteFor(problem, sent[problem.index]!)),
        ...(overLimit
          ? [t("limit", { max: result.data.maxItemsPerOrder })]
          : []),
      ]);
      // The messages say what changed; move the guest there.
      requestAnimationFrame(() => notesRef.current?.focus());
    } catch {
      // Offline or a server error: the cart stays as it is, the guest can try again.
      setError("error");
    } finally {
      setBusy(false);
    }
  };

  if (count === 0 && !open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setNotes([]);
          setError(undefined);
        }
      }}
    >
      {/* Hidden, not unmounted, while a sheet is open: one primary at a time, and Radix still
          returns focus to the trigger. The bottom padding clears the iPhone home indicator. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-120 flex-col gap-2 border-t border-border bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
          (hidden || open) && "invisible",
        )}
      >
        {atLimit && (
          <p className="text-small text-warning">
            {t("limit", { max: maxItemsPerOrder })}
          </p>
        )}
        <SheetTrigger asChild>
          <Button className="w-full tabular-nums">
            {t(barLabel, { count, subtotal })}
          </Button>
        </SheetTrigger>
      </div>
      <SheetContent closeLabel={t("closeLabel")}>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription className="tabular-nums">
            {t("quantity", { count })} · {subtotal}
          </SheetDescription>
        </SheetHeader>

        <div
          ref={notesRef}
          tabIndex={-1}
          aria-live="polite"
          className="flex flex-col gap-2 outline-none empty:hidden"
        >
          {closedReason && (
            <p
              id="cart-closed-reason"
              className="rounded-lg border border-warning bg-bg p-4 text-body"
            >
              {closedReason}
            </p>
          )}
          {notes.map((note) => (
            <p
              key={note}
              className="rounded-lg border border-warning bg-bg p-4 text-body"
            >
              {note}
            </p>
          ))}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-4 rounded-lg border border-danger bg-bg p-4 text-body"
            >
              <p>{t(error)}</p>
              {error === "invalid" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    update(() => []);
                    setError(undefined);
                  }}
                >
                  {t("clear")}
                </Button>
              )}
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <EmptyState
            message={t("empty")}
            action={
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t("backToMenu")}
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {lines.map((line) => (
              <li
                key={line.key}
                className="flex flex-col gap-2 border-b border-border pb-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-body font-semibold">{line.name}</span>
                  <span className="shrink-0 text-body tabular-nums">
                    {formatHuf(line.unitPriceHuf * line.quantity)}
                  </span>
                </div>
                {line.options.length > 0 && (
                  <p className="text-small text-text-muted">
                    {line.options.join(", ")}
                  </p>
                )}
                {soldOut.has(line.itemId) && (
                  <Badge status="neutral" className="self-start">
                    {tMenu("soldOut")}
                  </Badge>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    aria-label={t("decrease", { name: line.name })}
                    disabled={line.quantity <= 1}
                    onClick={() => setQuantity(line.key, line.quantity - 1)}
                  >
                    <MinusIcon aria-hidden />
                  </Button>
                  <output
                    aria-label={t("quantity", { count: line.quantity })}
                    className="w-10 text-center text-body tabular-nums"
                  >
                    {line.quantity}
                  </output>
                  <Button
                    variant="secondary"
                    aria-label={t("increase", { name: line.name })}
                    disabled={atLimit || line.quantity >= MAX_QUANTITY_PER_LINE}
                    onClick={() => setQuantity(line.key, line.quantity + 1)}
                  >
                    <PlusIcon aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setQuantity(line.key, 0)}
                    aria-label={t("remove", { name: line.name })}
                  >
                    {t("removeShort")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-auto flex flex-col gap-2 border-t border-border bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <p className="flex justify-between text-body font-semibold tabular-nums">
              <span>{t("subtotal")}</span>
              <span>{subtotal}</span>
            </p>
            <Button
              className="w-full"
              loading={busy}
              disabled={closedReason !== null}
              aria-describedby={closedReason ? "cart-closed-reason" : undefined}
              onClick={() => void proceed()}
            >
              {t("continue")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
