"use client";

import { minPicks, optionsHufOf, validateSelection } from "@namitiszunk/core";
import type {
  PublicMenuItem,
  PublicModifierGroup,
} from "@namitiszunk/core/menu";
import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  cn,
  focusRing,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@namitiszunk/ui";
import {
  CART_NOTE_MAX,
  MAX_QUANTITY_PER_LINE,
} from "@namitiszunk/validators/cart-limits";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useId, useState } from "react";

import { lineKey, type CartLine } from "../cart/use-cart";

type Props = {
  /** The item whose sheet is open; null closes it. */
  item: PublicMenuItem | null;
  /** How many more items fit under the venue's limit. */
  remaining: number;
  maxItemsPerOrder: number;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
};

/** The bottom product sheet (T-041): options, quantity and a note, then "Kosárba". */
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
  onAdd,
  onClose,
}: Props & { item: PublicMenuItem }) {
  const t = useTranslations("order.product");
  const tCart = useTranslations("order.cart");
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

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
  const atLimit = maxQuantity < 1;
  const valid = problems.length === 0 && !atLimit;
  const unitPriceHuf =
    item.priceHuf + optionsHufOf(item.modifierGroups, picked);

  const toggle = (group: PublicModifierGroup, modifierId: string) => {
    const inGroup = new Set(group.modifiers.map((m) => m.id));
    setPicked((current) => {
      if (group.maxSelect === 1) {
        return [...current.filter((m) => !inGroup.has(m)), modifierId];
      }
      return current.includes(modifierId)
        ? current.filter((m) => m !== modifierId)
        : [...current, modifierId];
    });
  };

  const add = () => {
    const trimmed = note.trim();
    const modifierIds = item.modifierGroups.flatMap((g) =>
      g.modifiers.filter((m) => picked.includes(m.id)).map((m) => m.id),
    );
    onAdd({
      key: lineKey(item.id, modifierIds, trimmed),
      itemId: item.id,
      name: item.name,
      unitPriceHuf,
      quantity: Math.min(quantity, maxQuantity),
      modifierIds,
      options: item.modifierGroups.flatMap((g) =>
        g.modifiers.filter((m) => picked.includes(m.id)).map((m) => m.name),
      ),
      note: trimmed,
    });
    onClose();
  };

  return (
    <>
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
        <p className="text-body tabular-nums">{formatHuf(item.priceHuf)}</p>
        {/* Radix wants a description; an item without one gets the price read out instead. */}
        <SheetDescription>
          {item.description ?? formatHuf(item.priceHuf)}
        </SheetDescription>
      </SheetHeader>

      {item.modifierGroups.map((group) => {
        const hint = groupHint(group, t);
        const radio = group.maxSelect === 1;
        const full =
          !radio &&
          group.modifiers.filter((m) => picked.includes(m.id)).length >=
            group.maxSelect;
        return (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full flex-wrap items-baseline gap-2">
              <span className="text-body font-semibold">{group.name}</span>
              {minPicks(group) > 0 && (
                <span className="text-small text-warning">{t("required")}</span>
              )}
              {hint && (
                <span className="text-small text-text-muted">{hint}</span>
              )}
            </legend>
            {group.modifiers.map((modifier) => {
              const checked = picked.includes(modifier.id);
              return (
                <label
                  key={modifier.id}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-4 rounded-md border px-4 has-focus-visible:ring-2 has-focus-visible:ring-primary",
                    checked ? "border-primary" : "border-border",
                    !checked && full && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type={radio ? "radio" : "checkbox"}
                    name={`${id}-${group.id}`}
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => toggle(group, modifier.id)}
                    className="size-5 accent-primary"
                  />
                  <span className="flex-1 text-body">{modifier.name}</span>
                  {modifier.priceDeltaHuf > 0 && (
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
            <span aria-hidden>−</span>
          </Button>
          <output
            aria-live="polite"
            className="w-8 text-center text-body tabular-nums"
          >
            {quantity}
          </output>
          <Button
            variant="secondary"
            aria-label={t("increase")}
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity((q) => q + 1)}
          >
            <span aria-hidden>+</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-note`} className="text-small font-medium">
          {t("note")}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          maxLength={CART_NOTE_MAX}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("notePlaceholder")}
          aria-describedby={`${id}-note-count`}
          className={cn(
            "rounded-md border border-border bg-bg px-4 py-2 text-body text-text placeholder:text-text-muted",
            focusRing,
          )}
        />
        <p
          id={`${id}-note-count`}
          className="self-end text-small text-text-muted tabular-nums"
        >
          {t("noteCount", { count: note.length, max: CART_NOTE_MAX })}
        </p>
      </div>

      {/* Sticky, so a long option list never hides the button (spec 41, risks). */}
      <div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-2 border-t border-border bg-surface p-6">
        <p
          id={`${id}-why`}
          aria-live="polite"
          className="text-small text-warning empty:hidden"
        >
          {atLimit
            ? tCart("limit", { max: maxItemsPerOrder })
            : missing
              ? t("missing", { groups: missing })
              : tooMany
                ? t("tooMany", { groups: tooMany })
                : null}
        </p>
        <Button
          disabled={!valid}
          aria-describedby={`${id}-why`}
          onClick={add}
          className="w-full"
        >
          {t("toCart", { price: formatHuf(unitPriceHuf * quantity) })}
        </Button>
      </div>
    </>
  );
}
