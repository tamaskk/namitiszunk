"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@namitiszunk/ui";
import type { BarViewOrder } from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type RejectChoice =
  { reason: "sold_out"; soldOutItemIds: string[] } | { reason: "other" };

/**
 * Rejecting a New order (T-054): a reason, and for "sold out" the item that ran out, which is then
 * marked sold out on the menu. The guest gets a full refund, so the dialog closes only by its buttons.
 */
export function RejectDialog({
  order,
  disabled,
  onCancel,
  onConfirm,
}: {
  order: BarViewOrder;
  disabled: boolean;
  onCancel(): void;
  onConfirm(choice: RejectChoice): void;
}) {
  const t = useTranslations("admin.barView.board");
  const [reason, setReason] = useState<"sold_out" | "other">("sold_out");
  const [soldOut, setSoldOut] = useState<ReadonlySet<string>>(new Set());
  const items = [
    ...new Map(order.items.map((item) => [item.itemId, item.name])),
  ];
  const ready = reason === "other" || soldOut.size > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent destructive>
        <DialogHeader>
          <DialogTitle>
            {t("rejectTitle", { number: order.shortNumber ?? "–" })}
          </DialogTitle>
          <DialogDescription>{t("rejectHint")}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-2 text-small text-text-muted">
            {t("rejectReason")}
          </legend>
          {(["sold_out", "other"] as const).map((value) => (
            <label
              key={value}
              className="flex h-16 cursor-pointer items-center gap-3 rounded-md border border-border px-4 text-body font-semibold has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-primary"
            >
              <input
                type="radio"
                name="reject-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="size-5 accent-primary"
              />
              {value === "sold_out" ? t("reasonSoldOut") : t("reasonOther")}
            </label>
          ))}
        </fieldset>
        {reason === "sold_out" && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-small text-text-muted">
              {t("whichSoldOut")}
            </legend>
            {items.map(([id, name]) => (
              <Checkbox
                key={id}
                label={name}
                checked={soldOut.has(id)}
                onChange={(checked) =>
                  setSoldOut((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
              />
            ))}
          </fieldset>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button size="bar" variant="secondary" onClick={onCancel}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            size="bar"
            variant="danger"
            disabled={disabled || !ready}
            onClick={() =>
              onConfirm(
                reason === "sold_out"
                  ? { reason, soldOutItemIds: [...soldOut] }
                  : { reason },
              )
            }
          >
            {t("confirmReject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
