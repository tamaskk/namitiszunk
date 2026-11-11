"use client";

import { ApiError } from "@namitiszunk/api-client";
import { vipChannel } from "@namitiszunk/core/realtime/channels";
import { Badge, Button, EmptyState, toast } from "@namitiszunk/ui";
import type { VipViewOrder, VipViewResponse } from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { registerDeviceAction } from "@/app/(dashboard)/pult/actions";
import { switchStaffAction } from "@/app/pin/actions";
import { adminApi } from "@/lib/admin-api";
import { useLiveList } from "@/lib/use-live-list";

// The VIP host hears an order the moment the bar marks it Ready.
const isNowReady = (order: { status: string }, before: string | undefined) =>
  order.status === "ready" && before !== "ready";

// The "{count} perce kész" clock: a 15 s step, null on the server so hydration matches.
const CLOCK_STEP_MS = 15_000;
const clockNow = () => Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
function onClockTick(tick: () => void) {
  const timer = setInterval(tick, CLOCK_STEP_MS);
  return () => clearInterval(timer);
}

/** The VIP host's phone (T-055): what to take out now, and what is coming. Portrait, one hand. */
export function VipBoard({
  venueId,
  onDevice,
  initial,
}: {
  venueId: string;
  onDevice: boolean;
  initial: VipViewResponse;
}) {
  const t = useTranslations("admin.vipView");
  const tBoard = useTranslations("admin.barView.board");
  const tBar = useTranslations("admin.barView");
  const load = useCallback(() => adminApi.vipView.get(venueId), [venueId]);
  const { view, online, fresh, soundOn, refresh } = useLiveList({
    venueId,
    channel: vipChannel(venueId),
    initial,
    load,
    arrived: isNowReady,
  });
  const now = useSyncExternalStore(onClockTick, clockNow, () => null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingUp, startSetUp] = useTransition();

  const ready = view.orders.filter((o) => o.status === "ready");
  const coming = view.orders.filter((o) => o.status !== "ready");
  const off = !online || busyId !== null;
  const label = (order: VipViewOrder) =>
    [
      order.tableName ?? t("noTable"),
      order.shortNumber !== null && t("order", { number: order.shortNumber }),
    ]
      .filter(Boolean)
      .join(", ");

  async function handOver(order: VipViewOrder) {
    setBusyId(order.id);
    try {
      await adminApi.barView.changeStatus(order.id, { event: "pick_up" });
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.code === "network_error"
          ? tBoard("errors.offline")
          : error instanceof ApiError && error.status === 409
            ? tBoard("errors.conflict")
            : tBoard("errors.generic"),
      );
    } finally {
      // Buttons come back only on the fresh list, so a second tap never hits the old state.
      await refresh();
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-guest flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-h1">{t("title")}</h1>
          <Badge status={online ? "neutral" : "rejected"}>
            {online ? tBoard("online") : tBoard("offline")}
          </Badge>
          {onDevice && (
            <form action={switchStaffAction}>
              <Button type="submit" variant="ghost">
                {view.staffName
                  ? t("switchStaff", { name: view.staffName })
                  : t("signOut")}
              </Button>
            </form>
          )}
        </div>
        {!onDevice && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
            <p className="text-body text-text-muted">{t("setUpHint")}</p>
            <Button
              variant="secondary"
              loading={settingUp}
              onClick={() =>
                startSetUp(async () => {
                  // Success redirects to the PIN screen; only a refusal comes back.
                  const result = await registerDeviceAction({});
                  toast.error(
                    result.error.code === "forbidden"
                      ? tBar("setUpForbidden")
                      : tBar("setUpFailed"),
                  );
                })
              }
            >
              {t("setUp")}
            </Button>
          </div>
        )}
        {!soundOn && (
          <p role="status" className="text-body text-warning">
            {tBoard("soundLocked")}
          </p>
        )}
        {!online && (
          <p
            role="alert"
            className="rounded-md bg-danger px-4 py-3 text-body font-semibold text-bg"
          >
            {tBoard("offlineBanner")}
          </p>
        )}
      </header>

      <main className="flex flex-col gap-6">
        <section aria-labelledby="vip-take-out" className="flex flex-col gap-3">
          <h2 id="vip-take-out" className="text-h2">
            {t("takeOut", { count: ready.length })}
          </h2>
          {ready.length === 0 ? (
            <EmptyState message={t("emptyTakeOut")} />
          ) : (
            ready.map((order) => (
              <article
                key={order.id}
                aria-label={label(order)}
                className={
                  fresh.has(order.id)
                    ? "flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4 ring-2 ring-primary"
                    : "flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                }
              >
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-display">
                    {order.tableName ?? t("noTable")}
                  </p>
                  <span className="text-order tabular-nums">
                    {order.shortNumber ?? "–"}
                  </span>
                </div>
                <p className="text-small text-text-muted">
                  {t("fromBar", { bar: order.barName })}
                  {order.readyAt && now && (
                    <>
                      {" · "}
                      {t("minutes", {
                        count: Math.max(
                          0,
                          Math.floor(
                            (now - new Date(order.readyAt).getTime()) / 60_000,
                          ),
                        ),
                      })}
                    </>
                  )}
                </p>
                <Items order={order} />
                <Button
                  size="bar"
                  loading={busyId === order.id}
                  disabled={off && busyId !== order.id}
                  onClick={() => void handOver(order)}
                >
                  {t("handedOver")}
                </Button>
              </article>
            ))
          )}
        </section>

        <section aria-labelledby="vip-coming" className="flex flex-col gap-3">
          <h2 id="vip-coming" className="text-h3 text-text-muted">
            {t("coming", { count: coming.length })}
          </h2>
          {coming.length === 0 ? (
            <p className="text-body text-text-muted">{t("emptyComing")}</p>
          ) : (
            coming.map((order) => (
              <article
                key={order.id}
                aria-label={label(order)}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 text-text-muted"
              >
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-h3">
                    {order.tableName ?? t("noTable")}
                  </p>
                  <Badge status={order.status === "new" ? "new" : "inProgress"}>
                    {order.status === "new"
                      ? t("statusNew")
                      : t("statusPreparing")}
                  </Badge>
                  <span className="text-h3 tabular-nums">
                    {order.shortNumber ?? "–"}
                  </span>
                </div>
                <Items order={order} />
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

function Items({ order }: { order: VipViewOrder }) {
  return (
    <ul className="flex flex-col gap-1">
      {order.items.map((item, i) => (
        <li key={`${item.name}-${i}`} className="text-body">
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
  );
}
