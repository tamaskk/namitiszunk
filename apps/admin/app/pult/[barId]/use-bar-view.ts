"use client";

import { barChannel } from "@namitiszunk/core/realtime/channels";
import type { BarViewResponse } from "@namitiszunk/validators";
import { useCallback } from "react";

import { adminApi } from "@/lib/admin-api";
import { useLiveList } from "@/lib/use-live-list";

// A bar sounds for an order it has not seen before that waits in New.
const isNewArrival = (order: { status: string }, before: string | undefined) =>
  order.status === "new" && before === undefined;

/** The bar's list (T-054), live on the bar channel. */
export function useBarView(venueId: string, initial: BarViewResponse) {
  const barId = initial.bar.id;
  const load = useCallback(() => adminApi.barView.get(barId), [barId]);
  return useLiveList({
    venueId,
    channel: barChannel(venueId, barId),
    initial,
    load,
    arrived: isNewArrival,
  });
}
