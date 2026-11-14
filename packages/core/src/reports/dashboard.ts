import "server-only";

import { Bar, Item, Order, Venue } from "@namitiszunk/db";
import { Types } from "mongoose";

import { type Actor, can, requirePermission } from "../auth/permissions";
import { NotFoundError } from "../errors";
import { barChannel } from "../realtime/channels";
import {
  type ProductRow,
  type ReportSummary,
  type WaitBucket,
  shiftDate,
  summarizeOrders,
  topProducts,
  venueBusinessDate,
  waitTimeTrend,
} from "./aggregations";

// Orders the bar still has work on; Ready ones wait at the pickup only (decision 2026-11-14).
const ACTIVE = ["new", "preparing"] as const;
/** A venue-wide pause on for longer than a bar pause can last is probably forgotten (decision 2026-11-14). */
export const FORGOTTEN_PAUSE_MS = 15 * 60_000;
const TOP_PRODUCTS = 5;

export type DashboardBar = {
  id: string;
  name: string;
  isOpen: boolean;
  /** ISO time while the bar's own pause runs. */
  pausedUntil: string | null;
  activeOrders: number;
  maxActiveOrders: number | null;
  atCapacity: boolean;
};

export type Dashboard = {
  businessDate: string;
  /** The same figures as the daily report of the day (T-061). */
  summary: ReportSummary;
  bars: DashboardBar[];
  trend: WaitBucket[];
  products: (ProductRow & { isAvailable: boolean })[];
  soldOut: { id: string; name: string; nameEn?: string }[];
  warnings: {
    /** ISO time the venue-wide pause started, once it has run for FORGOTTEN_PAUSE_MS. */
    pausedSince: string | null;
    expiredOrders: number;
    missingReceipts: number;
  };
  /** The venue-wide pause, for the switch. */
  ordersPausedAt: string | null;
  /** Bar channels the page listens on for a refresh (T-031). */
  channels: string[];
  can: { pauseBars: boolean; pauseVenue: boolean; setSoldOut: boolean };
};

/** The Manager's live view of the current business day (T-063). */
export async function getDashboard(
  actor: Actor,
  venueId: string,
  now = new Date(),
): Promise<Dashboard> {
  requirePermission(actor, "report.viewDaily", { venueId });
  const day = await venueBusinessDate(venueId, now);
  const range = { from: day, to: day };

  const [venue, bars, active, summary, trend, top, soldOut, missingReceipts] =
    await Promise.all([
      Venue.findById(venueId).select("ordersPausedAt").lean(),
      Bar.find({ venueId })
        .select("name isOpen pausedUntil maxActiveOrders")
        .sort({ name: 1 })
        .lean(),
      Order.aggregate<{ _id: unknown; count: number }>([
        {
          $match: {
            venueId: new Types.ObjectId(venueId),
            // Last night's orders can still be open after the business day turned.
            businessDate: { $in: [shiftDate(day, 1), day] },
            status: { $in: ACTIVE },
          },
        },
        { $group: { _id: "$barId", count: { $sum: 1 } } },
      ]),
      summarizeOrders(venueId, range),
      waitTimeTrend(venueId, now),
      topProducts(venueId, range, TOP_PRODUCTS),
      Item.find({ venueId, isAvailable: false, archivedAt: null })
        .select("name nameEn")
        .sort({ name: 1 })
        .lean(),
      // Same rule as the Orders module's filter (T-056): taken on, no receipt mark.
      Order.countDocuments({
        venueId,
        businessDate: day,
        paidAt: { $type: "date" },
        acceptedAt: { $type: "date" },
        receiptEnteredBy: { $exists: false },
      }),
    ]);
  if (!venue) throw new NotFoundError();

  const activeOf = new Map(active.map((a) => [String(a._id), a.count]));
  const available = new Map(
    (
      await Item.find({ _id: { $in: top.map((p) => p.itemId) }, venueId })
        .select("isAvailable")
        .lean()
    ).map((item) => [String(item._id), item.isAvailable ?? true]),
  );
  const pausedAt = venue.ordersPausedAt ?? null;

  return {
    businessDate: day,
    summary,
    bars: bars.map((bar) => {
      const activeOrders = activeOf.get(String(bar._id)) ?? 0;
      const max = bar.maxActiveOrders ?? null;
      return {
        id: String(bar._id),
        name: bar.name,
        isOpen: bar.isOpen ?? false,
        pausedUntil:
          bar.pausedUntil && bar.pausedUntil > now
            ? bar.pausedUntil.toISOString()
            : null,
        activeOrders,
        maxActiveOrders: max,
        atCapacity: max !== null && activeOrders >= max,
      };
    }),
    trend,
    products: top.map((p) => ({
      ...p,
      isAvailable: available.get(p.itemId) ?? true,
    })),
    soldOut: soldOut.map((item) => ({
      id: String(item._id),
      name: item.name,
      ...(item.nameEn ? { nameEn: item.nameEn } : {}),
    })),
    warnings: {
      pausedSince:
        pausedAt && now.getTime() - pausedAt.getTime() >= FORGOTTEN_PAUSE_MS
          ? pausedAt.toISOString()
          : null,
      expiredOrders: summary.expiredOrders,
      missingReceipts,
    },
    ordersPausedAt: pausedAt?.toISOString() ?? null,
    channels: bars.map((bar) => barChannel(venueId, String(bar._id))),
    can: {
      pauseBars: can(actor, "bar.pauseOrders", { venueId }),
      pauseVenue: can(actor, "venue.pauseOrders", { venueId }),
      setSoldOut: can(actor, "product.setSoldOut", { venueId }),
    },
  };
}
