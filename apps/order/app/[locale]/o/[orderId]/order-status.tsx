"use client";

import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@namitiszunk/ui";
import type { OrderResponse } from "@namitiszunk/validators";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { forgetOpenOrder, rememberOpenOrder } from "@/lib/open-orders";
import { statusView } from "@/lib/status-view";

import { ReadyScreen } from "./ready-screen";
import { type CancelResult, useOrderLive } from "./use-order-live";
import { useReadyAlerts } from "./use-ready-alerts";

const toneClass = {
  neutral: "text-text",
  success: "text-success",
  danger: "text-danger",
} as const;

export function OrderStatus({
  initial,
  token,
}: {
  initial: OrderResponse;
  token: string;
}) {
  const t = useTranslations("order.status");
  const locale = useLocale();
  const { order, problem, cancel } = useOrderLive(initial, token);
  const view = statusView(order.status);
  const { soundOn, enableSound, awake } = useReadyAlerts({
    ready: view.ready,
    wakeLock: view.wakeLock,
    readyTitle: t("readyTabTitle"),
  });
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);

  useEffect(() => {
    if (view.final) forgetOpenOrder(order.id);
    else rememberOpenOrder({ orderId: order.id, token });
  }, [order.id, token, view.final]);

  async function confirmCancel() {
    setCancelling(true);
    setCancelResult(null);
    setCancelResult(await cancel());
    setCancelling(false);
  }

  const title = t(`views.${view.key}.title`);
  const itemName = (item: OrderResponse["items"][number]) =>
    locale === "en" && item.nameEn ? item.nameEn : item.name;

  // Shown on the page too: the dialog closes by itself once the bar accepts the order.
  const cancelMessage =
    cancelResult === "accepted" || cancelResult === "failed" ? (
      <p role="alert" className="text-body text-danger">
        {t(`cancel.${cancelResult}`)}
      </p>
    ) : null;

  return (
    <main className="mx-auto max-w-[480px]">
      {/* The Ready overlay is modal: nothing behind it takes focus. */}
      <div
        inert={view.ready}
        className="flex min-h-dvh flex-col gap-8 px-4 py-6"
      >
        {/* Screen readers hear every status change. */}
        <p aria-live="polite" className="sr-only">
          {title}
        </p>

        {!view.final && (
          <Button variant="secondary" onClick={enableSound} disabled={soundOn}>
            {soundOn ? t("soundEnabled") : t("soundOn")}
          </Button>
        )}

        <header className="flex flex-col gap-2 text-center">
          <p className="text-label text-text-muted uppercase">{t("number")}</p>
          <p className="text-order tabular-nums">{order.number}</p>
          <h1 className={`text-h1 ${toneClass[view.tone]}`}>{title}</h1>
          <p className="text-body text-text-muted">
            {view.ready && order.isVip
              ? t("views.ready.vip")
              : t(`views.${view.key}.body`)}
          </p>
          {order.rejectionReason && (
            <p className="text-body">
              {t("reason", { reason: order.rejectionReason })}
            </p>
          )}
          {order.refundedHuf > 0 && (
            <p className="text-body">
              {t("refundedAmount", { amount: formatHuf(order.refundedHuf) })}
            </p>
          )}
          {order.barName && !view.final && (
            <p className="text-body">{t("pickupAt", { bar: order.barName })}</p>
          )}
        </header>

        {problem && (
          <p role="status" className="text-body text-warning">
            {t(problem)}
          </p>
        )}
        {view.wakeLock && awake === false && (
          <p className="text-body text-warning">{t("keepOpen")}</p>
        )}

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3 mb-4">{t("items")}</h2>
          <ul className="flex flex-col gap-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-4 text-body">
                <span>
                  {item.quantity} × {itemName(item)}
                </span>
                <span className="tabular-nums">
                  {formatHuf(item.lineTotalHuf)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t border-border pt-4 text-body font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{formatHuf(order.totalHuf)}</span>
          </p>
        </section>

        {/* Paid orders only: before payment, or after a timeout, there is nothing to confirm. */}
        {order.status !== "awaiting_payment" &&
          order.status !== "cancelled" && (
            <Button variant="ghost" asChild>
              <a
                href={`/${locale}/r/${order.id}?t=${encodeURIComponent(token)}`}
              >
                {t("confirmationLink")}
              </a>
            </Button>
          )}

        {order.canCancel && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="danger">{t("cancel.button")}</Button>
            </DialogTrigger>
            <DialogContent destructive>
              <DialogHeader>
                <DialogTitle>{t("cancel.title")}</DialogTitle>
                <DialogDescription>{t("cancel.body")}</DialogDescription>
              </DialogHeader>
              {cancelMessage}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t("cancel.keep")}</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  loading={cancelling}
                  onClick={confirmCancel}
                >
                  {t("cancel.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {!order.canCancel && cancelMessage}
      </div>

      {view.ready && (
        <ReadyScreen
          number={order.number}
          barName={order.barName}
          isVip={order.isVip}
        />
      )}
    </main>
  );
}
