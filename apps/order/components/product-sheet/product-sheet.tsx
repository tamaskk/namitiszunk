"use client";

import { minPicks, optionsHufOf, validateSelection } from "@namitiszunk/core";
import type {
  PublicMenuItem,
  PublicModifierGroup,
} from "@namitiszunk/core/menu";
import { formatHuf } from "@namitiszunk/i18n/format";
import {
  Button,
  cn,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@namitiszunk/ui";
import type { VenueStatusResponse } from "@namitiszunk/validators";
import { MAX_QUANTITY_PER_LINE } from "@namitiszunk/validators/cart-limits";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useId, useRef, useState } from "react";

import { lineKey, type CartLine } from "@/components/cart/use-cart";

type Props = {
  /** The item whose sheet is open; null closes it. */
  item: PublicMenuItem | null;
  /** How many more items fit under the venue's limit. */
  remaining: number;
  maxItemsPerOrder: number;
  /** The live venue status: only an open venue takes items. */
  status: VenueStatusResponse["status"];
  onAdd: (line: CartLine) => void;
  onClose: () => void;
};

// The same ring as focusRing, on the row around a focused radio or checkbox.
const rowFocusRing =
  "has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-(--focus-offset)";

/** The bottom product sheet (T-041): options and quantity, then "Kosárba". */
export function ProductSheet({
  item,
  onClose,
  returnFocus,
  ...props
}: Props & {
  /** The sheet has no Radix trigger, so the opener gets focus back from here. */
  returnFocus: () => void;
}) {
  const t = useTranslations("order.product");
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        closeLabel={t("closeLabel")}
        className="pb-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        {/* Keyed, so every item opens with a fresh selection. */}
        {item && (
          <ProductForm key={item.id} item={item} onClose={onClose} {...props} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function groupHint(
  group: PublicModifierGroup,
  t: ReturnType<typeof useTranslations<"order.product">>,
) {
  const min = minPicks(group);
  if (group.maxSelect === 1) return min === 1 ? t("pickOne") : null;
  return min > 0
    ? t("pickRange", { min, max: group.maxSelect })
    : t("pickUpTo", { max: group.maxSelect });
}

function ProductForm({
  item,
  remaining,
  maxItemsPerOrder,
  status,
  onAdd,
  onClose,
}: Props & { item: PublicMenuItem }) {
  const t = useTranslations("order.product");
  const tCart = useTranslations("order.cart");
  const id = useId();
  const formRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const maxQuantity = Math.min(MAX_QUANTITY_PER_LINE, remaining);
  const problems = validateSelection(item.modifierGroups, picked);
  const namesOf = (reason: "missing" | "tooMany") =>
    item.modifierGroups
      .filter((g) =>
        problems.some((p) => p.groupId === g.id && p.reason === reason),
      )
      .map((g) => g.name)
      .join(", ");
  const missing = namesOf("missing");
  const tooMany = namesOf("tooMany");
  const reason =
    status !== "open"
      ? tCart(status)
      : maxQuantity < 1
        ? tCart("limit", { max: maxItemsPerOrder })
        : missing
          ? t("missing", { groups: missing })
          : tooMany
            ? t("tooMany", { groups: tooMany })
            : null;
  const unitPriceHuf =
    item.priceHuf + optionsHufOf(item.modifierGroups, picked);

  const pick = (group: PublicModifierGroup, modifierId: string | null) => {
    const inGroup = new Set(group.modifiers.map((m) => m.id));
    setPicked((current) => {
      if (group.maxSelect === 1) {
        const others = current.filter((m) => !inGroup.has(m));
        return modifierId ? [...others, modifierId] : others;
      }
      return current.includes(modifierId!)
        ? current.filter((m) => m !== modifierId)
        : [...current, modifierId!];
    });
  };

  const add = () => {
    if (reason) {
      // aria-disabled keeps the button focusable; send the guest to the first group to fix.
      const first = problems.find((p) => p.groupId !== null)?.groupId;
      formRef.current
        ?.querySelector<HTMLInputElement>(`[data-group="${first}"] input`)
        ?.focus();
      return;
    }
    const chosen = item.modifierGroups.flatMap((g) =>
      g.modifiers.filter((m) => picked.includes(m.id)),
    );
    const modifierIds = chosen.map((m) => m.id);
    onAdd({
      key: lineKey(item.id, modifierIds),
      itemId: item.id,
      name: item.name,
      unitPriceHuf,
      quantity: Math.min(quantity, maxQuantity),
      modifierIds,
      options: chosen.map((m) => m.name),
    });
    onClose();
  };

  return (
    <div ref={formRef} className="contents">
      {item.imageUrl && (
        <div className="relative -mx-6 -mt-6 aspect-video">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(max-width: 480px) 100vw, 480px"
            className="rounded-t-lg object-cover"
          />
        </div>
      )}
      <SheetHeader>
        <SheetTitle>{item.name}</SheetTitle>
        {/* The price is the dialog's description, so it is read once. */}
        <SheetDescription className="text-body text-text tabular-nums">
          {formatHuf(item.priceHuf)}
        </SheetDescription>
        {item.description && (
          <p className="text-small text-text-muted">{item.description}</p>
        )}
      </SheetHeader>

      {item.modifierGroups.map((group) => {
        const hint = groupHint(group, t);
        const radio = group.maxSelect === 1;
        const required = minPicks(group) > 0;
        const count = group.modifiers.filter((m) =>
          picked.includes(m.id),
        ).length;
        const full = !radio && count >= group.maxSelect;
        // An optional single choice can be undone with an explicit "none" row.
        const rows = [
          ...(radio && !required ? [null] : []),
          ...group.modifiers,
        ];
        return (
          <fieldset
            key={group.id}
            data-group={group.id}
            className="flex flex-col gap-2"
          >
            <legend className="mb-2 flex w-full flex-wrap items-baseline gap-2">
              <span className="text-body font-semibold">{group.name}</span>
              {required && (
                <span className="text-small text-warning">{t("required")}</span>
              )}
              {hint && (
                <span className="text-small text-text-muted">{hint}</span>
              )}
            </legend>
            {rows.map((modifier) => {
              const checked = modifier
                ? picked.includes(modifier.id)
                : count === 0;
              const disabled = !checked && full;
              return (
                <label
                  key={modifier?.id ?? "none"}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-4 rounded-md border px-4",
                    rowFocusRing,
                    checked ? "border-primary" : "border-border",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type={radio ? "radio" : "checkbox"}
                    name={`${id}-${group.id}`}
                    checked={checked}
                    disabled={disabled}
                    required={radio && required}
                    onChange={() => pick(group, modifier?.id ?? null)}
                    className="size-5 accent-primary outline-none"
                  />
                  <span className="flex-1 text-body">
                    {modifier?.name ?? t("none")}
                  </span>
                  {modifier && modifier.priceDeltaHuf > 0 && (
                    <span className="text-small text-text-muted tabular-nums">
                      +{formatHuf(modifier.priceDeltaHuf)}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        );
      })}

      <div className="flex items-center justify-between gap-4">
        <span id={`${id}-qty`} className="text-body font-semibold">
          {t("quantity")}
        </span>
        <div
          role="group"
          aria-labelledby={`${id}-qty`}
          className="flex items-center gap-2"
        >
          <Button
            variant="secondary"
            aria-label={t("decrease")}
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => q - 1)}
          >
            <MinusIcon aria-hidden />
          </Button>
          <output
            aria-live="polite"
            className="w-10 text-center text-body tabular-nums"
          >
            {quantity}
          </output>
          <Button
            variant="secondary"
            aria-label={t("increase")}
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity((q) => q + 1)}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      </div>

      {/* Sticky, so a long option list never hides the button (spec 41, risks). */}
      <div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-2 border-t border-border bg-surface p-6">
        <p
          id={`${id}-why`}
          aria-live="polite"
          className="text-small text-warning empty:hidden"
        >
          {reason}
        </p>
        <Button
          aria-disabled={reason !== null}
          aria-describedby={reason ? `${id}-why` : undefined}
          onClick={add}
          className="w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {t("toCart", { price: formatHuf(unitPriceHuf * quantity) })}
        </Button>
      </div>
    </div>
  );
}
