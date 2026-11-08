import "server-only";

import { Item, Order } from "@namitiszunk/db";
import type { BarState } from "@namitiszunk/validators";

import { businessDate } from "../orders/business-date";
import { findPublicVenue, resolveBar } from "./public-menu";

const WAIT_WINDOW_MS = 30 * 60 * 1000;
const MIN_ORDERS_FOR_WAIT = 3;
// Orders the bar actually made: one cancelled or refunded after Ready says nothing about the wait.
const SERVED_STATUSES = ["ready", "picked_up", "expired"] as const;

export type VenueStatus = {
  status: BarState;
  pausedUntil: Date | null;
  estimatedWaitMinutes: number | null;
  soldOutItemIds: string[];
};

/** Median of durations in ms, as whole minutes (at least 1); null below three samples. */
export function medianWaitMinutes(durationsMs: number[]): number | null {
  if (durationsMs.length < MIN_ORDERS_FOR_WAIT) return null;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.max(1, Math.round(median / 60_000));
}

/**
 * The live part of the guest menu, or null for an unknown slug: open / paused / closed,
 * the estimated wait (median paid → ready of the bar's orders made ready in the last
 * 30 minutes) and the sold-out item ids.
 */
export async function getVenueStatus({
  slug,
  barId,
  now = new Date(),
}: {
  slug: string;
  barId?: string;
  now?: Date;
}): Promise<VenueStatus | null> {
  const venue = await findPublicVenue(slug);
  if (!venue) return null;
  const bar = await resolveBar(venue._id, barId);

  const since = new Date(now.getTime() - WAIT_WINDOW_MS);
  const [soldOut, readyOrders] = await Promise.all([
    // shortcut: includes VIP-only item ids (ids only, no names or prices); filter per zone if that matters.
    Item.find(
      { venueId: venue._id, archivedAt: null, isAvailable: false },
      { _id: 1 },
    ).lean(),
    bar
      ? Order.find(
          {
            venueId: venue._id,
            barId: bar._id,
            // Both dates so the window may cross the business-day start; keeps the bar_view index.
            businessDate: {
              $in: [
                ...new Set([now, since].map((at) => businessDate(at, venue))),
              ],
            },
            status: { $in: SERVED_STATUSES },
            readyAt: { $gte: since, $lte: now },
            paidAt: { $type: "date" },
          },
          { paidAt: 1, readyAt: 1 },
        ).lean()
      : [],
  ]);

  const pausedUntil =
    bar?.pausedUntil && bar.pausedUntil > now ? bar.pausedUntil : null;
  const status: BarState = !bar?.isOpen
    ? "closed"
    : pausedUntil
      ? "paused"
      : "open";

  return {
    status,
    pausedUntil,
    estimatedWaitMinutes: medianWaitMinutes(
      readyOrders.map((o) => o.readyAt!.getTime() - o.paidAt!.getTime()),
    ),
    soldOutItemIds: soldOut.map((item) => item._id.toString()),
  };
}
