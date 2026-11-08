"use client";

import {
  orderChannel,
  shouldApply,
  STATUS_EVENT,
  type StatusMessage,
} from "@namitiszunk/core/realtime/channels";
import type { OrderResponse } from "@namitiszunk/validators";
import type { BaseRealtime } from "ably/modular";
import { useCallback, useEffect, useState } from "react";

import { forgetOpenOrder } from "@/lib/open-orders";
import { orderApi, OrderApiError } from "@/lib/order-api";
import { statusView } from "@/lib/status-view";

// Ably silent longer than this: fall back to asking the API every POLL_MS (checked every TICK_MS).
const POLL_MS = 10_000;
const TICK_MS = 5_000;

export type LiveProblem = "offline" | "loadFailed" | null;
export type CancelResult = "cancelled" | "accepted" | "failed";

/** The order kept current by Ably, a refetch on reconnect and on return to the tab, and polling while Ably is down. */
export function useOrderLive(initial: OrderResponse, token: string) {
  const [order, setOrder] = useState(initial);
  const [problem, setProblem] = useState<LiveProblem>(null);
  const orderId = initial.id;
  const final = statusView(order.status).final;

  const refresh = useCallback(async () => {
    try {
      const next = await orderApi.get(orderId, token);
      setOrder((prev) => (shouldApply(prev.version, next) ? next : prev));
      setProblem(null);
    } catch (error) {
      // The order is gone for this token: do not offer it again from the menu.
      if (error instanceof OrderApiError && error.status === 404)
        forgetOpenOrder(orderId);
      setProblem(
        error instanceof OrderApiError && error.status === 0
          ? "offline"
          : "loadFailed",
      );
    }
  }, [orderId, token]);

  useEffect(() => {
    if (final) return;
    let ably: BaseRealtime | null = null;
    let stopped = false;
    // Loaded after the first paint (T-049 JS budget). The modular build carries only WebSocket and
    // fetch. If the import fails (offline), the poll below keeps the order current.
    void import("ably/modular").then(
      ({ BaseRealtime, FetchRequest, WebSocketTransport }) => {
        if (stopped) return;
        ably = new BaseRealtime({
          plugins: { WebSocketTransport, FetchRequest },
          authCallback: (_params, callback) => {
            orderApi.realtimeToken(token).then(
              (request) => callback(null, request),
              (error: unknown) => callback(String(error), null),
            );
          },
        });
        const channel = ably.channels.get(orderChannel(orderId));
        void channel.subscribe(STATUS_EVENT, (message) => {
          const data = message.data as StatusMessage;
          // Show the new status at once; the refetch brings the rest (refund, cancel option).
          // Cancel is possible only in New; once the order moves on it never comes back.
          setOrder((prev) =>
            shouldApply(prev.version, data)
              ? {
                  ...prev,
                  status: data.status,
                  version: data.version,
                  canCancel: prev.canCancel && data.status === "new",
                }
              : prev,
          );
          void refresh();
        });
        // Every (re)connect may have missed messages, including the gap between server render and subscribe.
        ably.connection.on("connected", () => void refresh());
      },
      () => {
        // No Ably chunk: polling takes over after POLL_MS.
      },
    );

    let lastLive = Date.now();
    let lastPoll = 0;
    const poll = setInterval(() => {
      const now = Date.now();
      if (ably?.connection.state === "connected") lastLive = now;
      else if (now - lastLive >= POLL_MS && now - lastPoll >= POLL_MS) {
        lastPoll = now;
        void refresh();
      }
    }, TICK_MS);
    // iOS Safari stops scripts on a locked or hidden tab: catch up when the guest looks again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      stopped = true;
      ably?.close();
    };
  }, [final, orderId, refresh, token]);

  const cancel = useCallback(async (): Promise<CancelResult> => {
    try {
      setOrder(await orderApi.cancel(orderId, token));
      return "cancelled";
    } catch (error) {
      if (error instanceof OrderApiError && error.status === 409) {
        // The bar accepted it meanwhile: show the current status instead of a stale Cancel button.
        await refresh();
        return "accepted";
      }
      return "failed";
    }
  }, [orderId, refresh, token]);

  return { order, problem, cancel };
}
