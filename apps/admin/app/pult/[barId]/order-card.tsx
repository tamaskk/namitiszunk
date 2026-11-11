"use client";

import { type CardAge, cardAge } from "@namitiszunk/core/bar-view/summary";
import { Badge, Button, cn } from "@namitiszunk/ui";
import type { BarViewOrder } from "@namitiszunk/validators";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

const ageStyle: Record<CardAge, string> = {
  fresh: "border-success text-success",
  waiting: "border-warning text-warning",
  late: "border-danger text-danger",
};

/** When the card's current wait started: paid for New, accepted for In progress, ready for Ready. */
function waitingSince(order: BarViewOrder): Date {
  const at =
    order.status === "preparing"
      ? order.acceptedAt
      : order.status === "ready"
        ? order.readyAt
        : null;
  return new Date(at ?? order.paidAt);
}

export type CardActions = {
  start(): void;
  markReady(): void;
  pickUp(): void;
  toggleReceipt(): void;
  remind(): void;
  reject(): void;
  move(): void;
};

/** One order on the board: big number, age colour, items, and the one action its column needs. */
export function OrderCard({
  order,
  now,
  pulse,
  highlighted,
  disabled,
  canMove,
  actions,
}: {
  order: BarViewOrder;
  now: Date;
  pulse: boolean;
  highlighted: boolean;
  disabled: boolean;
  canMove: boolean;
  actions: CardActions;
}) {
  const t = useTranslations("admin.barView.board");
  const since = waitingSince(order);
  const age = cardAge(since, now);
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - since.getTime()) / 60_000),
  );
  const number = order.shortNumber ?? "–";

  return (
    <article
      id={`order-${order.id}`}
      aria-label={t("order", { number })}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface p-4 transition-shadow",
        highlighted || pulse
          ? "border-primary ring-2 ring-primary"
          : "border-border",
      )}
    >
      <header className="flex items-start gap-2">
        <span className="flex-1 text-order tabular-nums">{number}</span>
        {order.isVip && <Badge status="neutral">{t("vip")}</Badge>}
        {order.adult && (
          <Badge status="neutral" aria-label={t("adultLabel")}>
            {t("adult")}
          </Badge>
        )}
        <span
          className={cn(
            "rounded-sm border px-2 text-label tabular-nums",
            ageStyle[age],
          )}
        >
          {t("minutes", { count: minutes })}
        </span>
      </header>

      <ul className="flex flex-col gap-1">
        {order.items.map((item, i) => (
          <li key={`${item.itemId}-${i}`} className="text-body">
            <span className="font-semibold tabular-nums">{item.quantity}×</span>{" "}
            {item.name}
            {item.options.length > 0 && (
              <span className="block text-small text-text-muted">
                {item.options.join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.status === "new" && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="bar"
            className="col-span-2"
            disabled={disabled}
            onClick={actions.start}
          >
            {t("start")}
          </Button>
          <Button
            size="bar"
            variant="secondary"
            className={canMove ? "" : "col-span-2"}
            disabled={disabled}
            onClick={actions.reject}
          >
            {t("reject")}
          </Button>
          {canMove && (
            <Button
              size="bar"
              variant="secondary"
              disabled={disabled}
              onClick={actions.move}
            >
              {t("move")}
            </Button>
          )}
        </div>
      )}

      {order.status === "preparing" && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="bar"
            variant={order.receiptEnteredBy ? "ghost" : "secondary"}
            aria-pressed={order.receiptEnteredBy !== null}
            className="col-span-2"
            disabled={disabled}
            onClick={actions.toggleReceipt}
          >
            {order.receiptEnteredBy && <Check aria-hidden />}
            {order.receiptEnteredBy
              ? t("receiptBy", { name: order.receiptEnteredBy })
              : t("receipt")}
          </Button>
          <Button
            size="bar"
            className={canMove ? "" : "col-span-2"}
            disabled={disabled}
            onClick={actions.markReady}
          >
            {t("ready")}
          </Button>
          {canMove && (
            <Button
              size="bar"
              variant="secondary"
              disabled={disabled}
              onClick={actions.move}
            >
              {t("move")}
            </Button>
          )}
        </div>
      )}

      {order.status === "ready" && (
        <div className="grid grid-cols-2 gap-2">
          {order.isVip ? (
            <p className="col-span-2 flex h-16 items-center justify-center rounded-md border border-border text-body font-semibold text-text-muted">
              {t("vipCarries")}
            </p>
          ) : (
            <Button
              size="bar"
              className="col-span-2"
              disabled={disabled}
              onClick={actions.pickUp}
            >
              {t("pickedUp")}
            </Button>
          )}
          <Button
            size="bar"
            variant="secondary"
            className={canMove ? "" : "col-span-2"}
            disabled={disabled || order.reminderSentAt !== null}
            onClick={actions.remind}
          >
            {order.reminderSentAt ? t("reminded") : t("remind")}
          </Button>
          {canMove && (
            <Button
              size="bar"
              variant="secondary"
              disabled={disabled}
              onClick={actions.move}
            >
              {t("move")}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
