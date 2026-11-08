"use client";

import { shouldApply } from "@namitiszunk/core/realtime/channels";
import type { OrderResponse } from "@namitiszunk/validators";
import { useCallback, useEffect, useState } from "react";

import { forgetOpenOrder } from "@/lib/open-orders";
import { orderApi, OrderApiError } from "@/lib/order-api";
import { statusView } from "@/lib/status-view";

import { connectOrderLive } from "./live-realtime";

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
    const live = connectOrderLive(orderId, token, {
      onStatus: (data) => {
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
      },
      // Every (re)connect may have missed messages, including the gap between server render and subscribe.
      onConnected: () => void refresh(),
    });

    let lastLive = Date.now();
    let lastPoll = 0;
    const poll = setInterval(() => {
      const now = Date.now();
      if (live.connected()) lastLive = now;
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
      live.close();
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
