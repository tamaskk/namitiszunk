"use client";

import { ApiError } from "@namitiszunk/api-client";
import { rushSummary } from "@namitiszunk/core/bar-view/summary";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  toast,
} from "@namitiszunk/ui";
import type { BarViewOrder, BarViewResponse } from "@namitiszunk/validators";
import { Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { setItemAvailableAction } from "@/app/(dashboard)/menu/actions";
import { switchStaffAction } from "@/app/pin/actions";
import { adminApi } from "@/lib/admin-api";

import { type CardActions, OrderCard } from "./order-card";
import { RejectDialog, type RejectChoice } from "./reject-dialog";
import { useBarView } from "./use-bar-view";

const columns = ["new", "preparing", "ready"] as const;
const pauseMinutes = [5, 10, 15] as const;
type Panel = "products" | "summary" | "expired" | null;

/** The bar tablet (T-054): three columns, a top bar, and every action one tap away. */
export function BarBoard({
  venueId,
  staffName,
  initial,
}: {
  venueId: string;
  staffName: string | null;
  initial: BarViewResponse;
}) {
  const t = useTranslations("admin.barView.board");
  const tBar = useTranslations("admin.barView");
  const format = useFormatter();
  const { view, online, fresh, soundOn, refresh } = useBarView(
    venueId,
    initial,
  );
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  // Ids, not snapshots: the dialog follows the live list and closes when another tablet got there first.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const rejecting =
    view.orders.find((o) => o.id === rejectingId && o.status === "new") ?? null;
  const moving =
    view.orders.find((o) => o.id === movingId && o.status !== "expired") ??
    null;

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  }, []);

  const off = !online || busy;
  const byStatus = (status: BarViewOrder["status"]) =>
    view.orders.filter((o) => o.status === status);
  const active = view.orders.filter((o) => o.status !== "expired").length;
  const atCapacity =
    view.bar.maxActiveOrders !== null && active >= view.bar.maxActiveOrders;
  const expired = byStatus("expired");
  const searched = search.trim() === "" ? null : Number(search);
  const match =
    searched === null
      ? null
      : (view.orders.find((o) => o.shortNumber === searched) ?? null);
  const pausedUntil =
    view.bar.pausedUntil && new Date(view.bar.pausedUntil) > now
      ? new Date(view.bar.pausedUntil)
      : null;

  useEffect(() => {
    if (match)
      document
        .getElementById(`order-${match.id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [match]);

  /** Runs one API call, then reloads; a refusal becomes a toast, never a stale board. */
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(errorMessage(error));
      if (error instanceof ApiError && error.status === 409) {
        setRejectingId(null);
        setMovingId(null);
      }
    } finally {
      // Buttons come back only on the fresh list, so a second tap never hits the old state.
      await refresh();
      setBusy(false);
    }
  }

  function errorMessage(error: unknown): string {
    if (!(error instanceof ApiError)) return t("errors.generic");
    if (error.code === "network_error") return t("errors.offline");
    if (error.code === "reminder_not_sendable") return t("errors.reminderSent");
    return error.status === 409 ? t("errors.conflict") : t("errors.generic");
  }

  const cardActions = (order: BarViewOrder): CardActions => ({
    start: () =>
      void act(() =>
        adminApi.barView.changeStatus(order.id, { event: "start_preparing" }),
      ),
    markReady: () =>
      void act(() =>
        adminApi.barView.changeStatus(order.id, { event: "mark_ready" }),
      ),
    pickUp: () =>
      void act(() =>
        adminApi.barView.changeStatus(order.id, { event: "pick_up" }),
      ),
    toggleReceipt: () =>
      void act(() =>
        adminApi.barView.setReceipt(order.id, {
          entered: order.receiptEnteredBy === null,
        }),
      ),
    remind: () => void act(() => adminApi.barView.remind(order.id)),
    reject: () => setRejectingId(order.id),
    move: () => setMovingId(order.id),
  });

  function confirmReject(choice: RejectChoice) {
    const order = rejecting;
    if (!order) return;
    void act(async () => {
      await adminApi.barView.reject(order.id, choice);
      setRejectingId(null);
    });
  }

  function moveTo(barId: string) {
    const order = moving;
    if (!order) return;
    void act(async () => {
      await adminApi.barView.move(order.id, { barId });
      setMovingId(null);
    });
  }

  function toggleProduct(id: string, available: boolean) {
    void act(async () => {
      const result = await setItemAvailableAction({ id, available });
      if ("error" in result) throw new Error(result.error.code);
    });
  }

  return (
    <div className="flex h-dvh flex-col gap-3 p-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2">{view.bar.name}</h1>
          <span className="text-body tabular-nums text-text-muted">
            {format.dateTime(now, { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span
            className={
              atCapacity ? "text-body text-danger" : "text-body text-text"
            }
          >
            {view.bar.maxActiveOrders === null
              ? t("active", { count: active })
              : t("activeOf", { count: active, max: view.bar.maxActiveOrders })}
          </span>
          <span className="text-body text-text-muted">
            {view.averagePrepMinutes === null
              ? t("avgPrepNone")
              : t("avgPrep", { minutes: Math.round(view.averagePrepMinutes) })}
          </span>
          <Badge status={online ? "neutral" : "rejected"}>
            {online ? t("online") : t("offline")}
          </Badge>
          {!soundOn && (
            <span role="status" className="text-body text-warning">
              {t("soundLocked")}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              type="search"
              inputMode="numeric"
              aria-label={t("searchLabel")}
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
              className="w-32"
            />
            <Button variant="secondary" onClick={() => setPanel("summary")}>
              {t("summary")}
            </Button>
            <Button variant="secondary" onClick={() => setPanel("products")}>
              {t("products")}
            </Button>
            <Button variant="secondary" onClick={() => setPanel("expired")}>
              {t("expired", { count: expired.length })}
            </Button>
            <form action={switchStaffAction}>
              <Button type="submit" variant="ghost">
                {tBar("switchStaff", { name: staffName ?? "" })}
              </Button>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pausedUntil ? (
            <>
              <span className="text-body text-warning">
                {t("pausedUntil", {
                  time: format.dateTime(pausedUntil, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </span>
              <Button
                variant="secondary"
                disabled={off}
                onClick={() =>
                  void act(() =>
                    adminApi.barView.pause(view.bar.id, { minutes: 0 }),
                  )
                }
              >
                {t("resume")}
              </Button>
            </>
          ) : (
            <>
              <span className="text-body text-text-muted">{t("pause")}</span>
              {pauseMinutes.map((minutes) => (
                <Button
                  key={minutes}
                  variant="secondary"
                  disabled={off}
                  onClick={() =>
                    void act(() =>
                      adminApi.barView.pause(view.bar.id, { minutes }),
                    )
                  }
                >
                  {t("pauseFor", { minutes })}
                </Button>
              ))}
            </>
          )}
          {searched !== null && !match && (
            <span role="status" className="text-body text-warning">
              {t("notFound")}
            </span>
          )}
        </div>

        {!online && (
          <p
            role="alert"
            className="rounded-md bg-danger px-4 py-3 text-body font-semibold text-bg"
          >
            {t("offlineBanner")}
          </p>
        )}
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-3 gap-4">
        {columns.map((status) => {
          const orders = byStatus(status);
          return (
            <section
              key={status}
              aria-labelledby={`column-${status}`}
              className="flex min-h-0 flex-col gap-3"
            >
              <h2 id={`column-${status}`} className="text-h3">
                {t(`columns.${status}`)} ({orders.length})
              </h2>
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                {orders.length === 0 ? (
                  <p className="text-body text-text-muted">
                    {t("emptyColumn")}
                  </p>
                ) : (
                  orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      pulse={fresh.has(order.id)}
                      highlighted={match?.id === order.id}
                      disabled={off}
                      canMove={view.otherBars.length > 0}
                      actions={cardActions(order)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </main>

      {rejecting && (
        <RejectDialog
          order={rejecting}
          disabled={off}
          onCancel={() => setRejectingId(null)}
          onConfirm={confirmReject}
        />
      )}

      <Dialog
        open={moving !== null}
        onOpenChange={(o) => !o && setMovingId(null)}
      >
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>
              {t("moveTitle", { number: moving?.shortNumber ?? "–" })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {view.otherBars.map((bar) => (
              <Button
                key={bar.id}
                size="bar"
                variant="secondary"
                disabled={off}
                onClick={() => moveTo(bar.id)}
              >
                {bar.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="right" closeLabel={t("close")}>
          {panel === "products" && (
            <>
              <SheetHeader>
                <SheetTitle>{t("products")}</SheetTitle>
              </SheetHeader>
              {view.products.length === 0 ? (
                <EmptyState message={t("productsEmpty")} />
              ) : (
                <ul className="flex flex-col gap-2 overflow-y-auto">
                  {view.products.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center gap-3 border-b border-border py-2"
                    >
                      <span className="flex-1 text-body">{product.name}</span>
                      {/* One stable name ("<product>: Sold out"); aria-pressed carries the state (WCAG 2.5.3). */}
                      <Button
                        variant="secondary"
                        disabled={off}
                        aria-pressed={!product.isAvailable}
                        onClick={() =>
                          toggleProduct(product.id, !product.isAvailable)
                        }
                      >
                        {!product.isAvailable && <Check aria-hidden />}
                        <span className="sr-only">{product.name}: </span>
                        {t("soldOut")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {panel === "summary" && (
            <>
              <SheetHeader>
                <SheetTitle>{t("summaryTitle")}</SheetTitle>
              </SheetHeader>
              <SummaryList orders={view.orders} empty={t("summaryEmpty")} />
            </>
          )}
          {panel === "expired" && (
            <>
              <SheetHeader>
                <SheetTitle>{t("expiredTitle")}</SheetTitle>
              </SheetHeader>
              {expired.length === 0 ? (
                <EmptyState message={t("expiredEmpty")} />
              ) : (
                <ul className="flex flex-col gap-2 overflow-y-auto">
                  {expired.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-md border border-border p-3"
                    >
                      <span className="text-h3 tabular-nums">
                        {order.shortNumber ?? "–"}
                      </span>
                      <span className="block text-small text-text-muted">
                        {order.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryList({
  orders,
  empty,
}: {
  orders: readonly BarViewOrder[];
  empty: string;
}) {
  const lines = rushSummary(orders);
  if (lines.length === 0) return <EmptyState message={empty} />;
  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {lines.map((line) => (
        <li
          key={`${line.name}|${line.options.join("|")}`}
          className="text-body"
        >
          <span className="font-semibold tabular-nums">{line.quantity}×</span>{" "}
          {line.name}
          {line.options.length > 0 && (
            <span className="block text-small text-text-muted">
              {line.options.join(", ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
