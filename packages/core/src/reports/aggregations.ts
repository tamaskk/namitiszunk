import "server-only";

import {
  AuditLog,
  Bar,
  Order,
  QrCode,
  Refund,
  Venue,
  VenueMember,
  Zone,
} from "@namitiszunk/db";
import { Types } from "mongoose";

import { NotFoundError } from "../errors";
import { businessDate } from "../orders/business-date";

// Report figures (T-061), reused by the weekly e-mail (T-062) and the dashboard (T-063). These
// functions do not check permissions: callers do (reports.ts), or run as the system (Inngest).
// Every figure counts paid orders by their business day, like the Orders export (T-056).

/** Business days `from`–`to` ("YYYY-MM-DD"), both included. */
export type DayRange = { from: string; to: string };

export type ReportSummary = {
  /** Paid orders: every row of the Orders export for the same days. */
  orders: number;
  /** Order totals without the tip, before refunds, in forints. */
  revenueHuf: number;
  tipHuf: number;
  /** revenueHuf / orders, rounded to whole forints; 0 without orders. */
  avgBasketHuf: number;
  /** Payment → Ready, over orders that reached Ready; null when none did. */
  avgPrepSeconds: number | null;
  medianPrepSeconds: number | null;
  /** Ready → Picked up. */
  avgPickupSeconds: number | null;
  /** Orders with at least one succeeded refund, and the refunded forints. */
  refundedOrders: number;
  refundedHuf: number;
  expiredOrders: number;
};

/** One row of a breakdown by day, hour, bar or QR source. */
export type BreakdownRow = {
  /** Business date, hour "0"–"23", bar id, QR code id, or "none" for orders without a QR. */
  key: string;
  label: string;
  orders: number;
  /** Items sold (quantities), rejected lines left out. */
  items: number;
  revenueHuf: number;
  tipHuf: number;
};

export type ProductRow = {
  itemId: string;
  /** The name stored on the order when it was placed. */
  name: string;
  nameEn?: string;
  quantity: number;
  orders: number;
  revenueHuf: number;
};

/** Orders per weekday of the business day (1 = Monday … 7 = Sunday) and local hour of payment. */
export type HeatCell = { weekday: number; hour: number; orders: number };

export type BartenderRow = {
  memberId: string;
  name: string;
  /** Orders this member marked Ready. */
  readyOrders: number;
  /** First to last order action, summed per business day. */
  activeSeconds: number;
  /** readyOrders per active hour, one decimal; null when the member made a single action. */
  ordersPerHour: number | null;
  /** Preparing → Ready over the orders this member marked Ready. */
  avgPrepToReadySeconds: number | null;
  /** Tips of the orders this member marked Ready: informational, the club shares tips. */
  tipHuf: number;
};

export type WaitBucket = {
  start: Date;
  /** Orders paid in this bucket. */
  orders: number;
  /** Payment → Ready, or → now for orders still waiting; null without such orders. */
  avgWaitSeconds: number | null;
};

type VenueClock = { timezone: string; businessDayStart: string };

export async function venueClock(venueId: string): Promise<VenueClock> {
  const venue = await Venue.findById(venueId)
    .select("timezone businessDayStart")
    .lean();
  if (!venue) throw new NotFoundError();
  return {
    timezone: venue.timezone ?? "Europe/Budapest",
    businessDayStart: venue.businessDayStart ?? "06:00",
  };
}

/** The venue's current business day, "YYYY-MM-DD". */
export async function venueBusinessDate(
  venueId: string,
  now = new Date(),
): Promise<string> {
  return businessDate(now, await venueClock(venueId));
}

/** The business day `days` before `date` (negative: after). */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Whole percent change from `previous` to `current`; null when there is nothing to compare with. */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Paid orders always have a short number (T-024); naming it lets the short_number index
// (venueId, businessDate, shortNumber) serve every report query.
function paidIn(venueId: string, range: DayRange): Record<string, unknown> {
  return {
    venueId,
    businessDate: { $gte: range.from, $lte: range.to },
    shortNumber: { $type: "number" as const },
    paidAt: { $type: "date" as const },
  };
}

// Aggregations skip Mongoose casting: the venue id must already be an ObjectId.
const matchPaid = (venueId: string, range: DayRange) => ({
  $match: { ...paidIn(venueId, range), venueId: new Types.ObjectId(venueId) },
});

const tip = { $ifNull: ["$tipHuf", 0] };
const sold = {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: "$items",
          cond: { $ne: ["$$this.status", "rejected"] },
        },
      },
      in: "$$this.quantity",
    },
  },
};
const totals = {
  orders: { $sum: 1 },
  items: { $sum: sold },
  revenueHuf: { $sum: { $subtract: ["$totalHuf", tip] } },
  tipHuf: { $sum: tip },
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const seconds = (ms: number | null) =>
  ms === null ? null : Math.round(ms / 1000);

/** Summaries grouped by `key` (null: one group); refunds are counted by the order's business day. */
async function summaries(
  venueId: string,
  range: DayRange,
  key: unknown,
): Promise<Map<string, ReportSummary>> {
  const isDate = (field: string) => ({ $eq: [{ $type: field }, "date"] });
  const groups = await Order.aggregate<{
    _id: unknown;
    orders: number;
    revenueHuf: number;
    tipHuf: number;
    expiredOrders: number;
    prepMs: (number | null)[];
    avgPickupMs: number | null;
    ids: Types.ObjectId[];
  }>([
    matchPaid(venueId, range),
    {
      $group: {
        _id: key,
        orders: totals.orders,
        revenueHuf: totals.revenueHuf,
        tipHuf: totals.tipHuf,
        expiredOrders: {
          $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] },
        },
        prepMs: {
          $push: {
            $cond: [
              isDate("$readyAt"),
              { $subtract: ["$readyAt", "$paidAt"] },
              null,
            ],
          },
        },
        // $avg skips the nulls of orders never picked up.
        avgPickupMs: {
          $avg: {
            $cond: [
              { $and: [isDate("$readyAt"), isDate("$pickedUpAt")] },
              { $subtract: ["$pickedUpAt", "$readyAt"] },
              null,
            ],
          },
        },
        ids: { $push: "$_id" },
      },
    },
  ]).option({ maxTimeMS: 20_000 });

  // shortcut: refunds are matched by order id list; fine for a pilot's ≤ 92 days, a $lookup once venues grow.
  const refunds = await Refund.aggregate<{ _id: Types.ObjectId; huf: number }>([
    {
      $match: {
        orderId: { $in: groups.flatMap((g) => g.ids) },
        status: "succeeded",
      },
    },
    { $group: { _id: "$orderId", huf: { $sum: "$amountHuf" } } },
  ]);
  const refunded = new Map(refunds.map((r) => [String(r._id), r.huf]));

  return new Map(
    groups.map((g) => {
      const prep = g.prepMs.filter((ms): ms is number => ms !== null);
      const refundedHere = g.ids
        .map((id) => refunded.get(String(id)))
        .filter((huf): huf is number => huf !== undefined);
      return [
        String(g._id),
        {
          orders: g.orders,
          revenueHuf: g.revenueHuf,
          tipHuf: g.tipHuf,
          avgBasketHuf: g.orders ? Math.round(g.revenueHuf / g.orders) : 0,
          avgPrepSeconds: seconds(
            prep.length ? prep.reduce((a, b) => a + b, 0) / prep.length : null,
          ),
          medianPrepSeconds: seconds(median(prep)),
          avgPickupSeconds: seconds(g.avgPickupMs),
          refundedOrders: refundedHere.length,
          refundedHuf: refundedHere.reduce((a, b) => a + b, 0),
          expiredOrders: g.expiredOrders,
        },
      ];
    }),
  );
}

export const emptySummary: ReportSummary = {
  orders: 0,
  revenueHuf: 0,
  tipHuf: 0,
  avgBasketHuf: 0,
  avgPrepSeconds: null,
  medianPrepSeconds: null,
  avgPickupSeconds: null,
  refundedOrders: 0,
  refundedHuf: 0,
  expiredOrders: 0,
};

/** The headline figures of business days `from`–`to` (daily report, weekly e-mail, dashboard). */
export async function summarizeOrders(
  venueId: string,
  range: DayRange,
): Promise<ReportSummary> {
  return (await summaries(venueId, range, null)).get("null") ?? emptySummary;
}

/** The headline figures of each business day with orders, oldest first. */
export async function summarizeByDay(
  venueId: string,
  range: DayRange,
): Promise<(ReportSummary & { businessDate: string })[]> {
  const byDay = await summaries(venueId, range, "$businessDate");
  return [...byDay]
    .map(([day, summary]) => ({ businessDate: day, ...summary }))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));
}

async function breakdown(
  venueId: string,
  range: DayRange,
  key: unknown,
): Promise<Omit<BreakdownRow, "label">[]> {
  const rows = await Order.aggregate<
    Omit<BreakdownRow, "key" | "label"> & { _id: unknown }
  >([matchPaid(venueId, range), { $group: { _id: key, ...totals } }]).option({
    maxTimeMS: 20_000,
  });
  return rows.map(({ _id, ...row }) => ({
    key: _id === null ? "none" : String(_id),
    ...row,
  }));
}

// Hours of a night in business-day order: from the day's start (06:00) round to the next morning.
function nightOrder(startHour: number) {
  return (hour: number) => (hour - startHour + 24) % 24;
}

/** Paid orders per local hour of payment, in the order of the night (06:00 … 05:00). */
export async function hourlyBreakdown(
  venueId: string,
  range: DayRange,
): Promise<BreakdownRow[]> {
  const clock = await venueClock(venueId);
  const rank = nightOrder(Number(clock.businessDayStart.slice(0, 2)));
  const rows = await breakdown(venueId, range, {
    $hour: { date: "$paidAt", timezone: clock.timezone },
  });
  return rows
    .sort((a, b) => rank(Number(a.key)) - rank(Number(b.key)))
    .map((row) => ({
      ...row,
      label: `${row.key.padStart(2, "0")}:00`,
    }));
}

/** Paid orders per business day, oldest first. */
export async function dailyBreakdown(
  venueId: string,
  range: DayRange,
): Promise<BreakdownRow[]> {
  const rows = await breakdown(venueId, range, "$businessDate");
  return rows
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ ...row, label: row.key }));
}

/** Paid orders per bar, most revenue first. */
export async function barBreakdown(
  venueId: string,
  range: DayRange,
): Promise<BreakdownRow[]> {
  const [rows, bars] = await Promise.all([
    breakdown(venueId, range, "$barId"),
    Bar.find({ venueId }).select("name").lean(),
  ]);
  const name = new Map(bars.map((bar) => [String(bar._id), bar.name]));
  return rows
    .sort((a, b) => b.revenueHuf - a.revenueHuf)
    .map((row) => ({ ...row, label: name.get(row.key) ?? "" }));
}

/**
 * Paid orders per printed QR (T-053), labelled with its zone (or bar) and code. Orders placed
 * before T-061 or from a typed link have none: key "none", label "".
 */
export async function qrSourceBreakdown(
  venueId: string,
  range: DayRange,
): Promise<BreakdownRow[]> {
  const rows = await breakdown(venueId, range, {
    $ifNull: ["$qrCodeId", null],
  });
  const ids = rows.filter((r) => r.key !== "none").map((r) => r.key);
  const [codes, zones, bars] = await Promise.all([
    QrCode.find({ _id: { $in: ids }, venueId })
      .select("code zoneId barId")
      .lean(),
    Zone.find({ venueId }).select("name").lean(),
    Bar.find({ venueId }).select("name").lean(),
  ]);
  const zoneName = new Map(zones.map((z) => [String(z._id), z.name]));
  const barName = new Map(bars.map((b) => [String(b._id), b.name]));
  const label = new Map(
    codes.map((qr) => {
      const place =
        zoneName.get(String(qr.zoneId)) ?? barName.get(String(qr.barId));
      return [String(qr._id), place ? `${place} (${qr.code})` : qr.code];
    }),
  );
  return rows
    .sort((a, b) => b.orders - a.orders)
    .map((row) => ({ ...row, label: label.get(row.key) ?? "" }));
}

/** Paid orders per weekday of the business day × local hour of payment: the peak-hours heatmap. */
export async function heatmap(
  venueId: string,
  range: DayRange,
): Promise<HeatCell[]> {
  const { timezone } = await venueClock(venueId);
  return Order.aggregate<HeatCell>([
    matchPaid(venueId, range),
    {
      $group: {
        _id: {
          weekday: {
            $isoDayOfWeek: { $dateFromString: { dateString: "$businessDate" } },
          },
          hour: { $hour: { date: "$paidAt", timezone } },
        },
        orders: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        weekday: "$_id.weekday",
        hour: "$_id.hour",
        orders: 1,
      },
    },
    { $sort: { weekday: 1, hour: 1 } },
  ]).option({ maxTimeMS: 20_000 });
}

/** Best sellers by quantity (ties: revenue), rejected lines left out. */
export async function topProducts(
  venueId: string,
  range: DayRange,
  limit = 10,
): Promise<ProductRow[]> {
  const rows = await Order.aggregate<
    Omit<ProductRow, "itemId"> & { _id: Types.ObjectId }
  >([
    matchPaid(venueId, range),
    { $unwind: "$items" },
    { $match: { "items.status": { $ne: "rejected" } } },
    {
      $group: {
        _id: "$items.itemId",
        // The latest snapshot names the row when the item was renamed in between.
        name: { $last: "$items.name" },
        nameEn: { $last: "$items.nameEn" },
        quantity: { $sum: "$items.quantity" },
        orderIds: { $addToSet: "$_id" },
        revenueHuf: { $sum: "$items.lineTotalHuf" },
      },
    },
    {
      $project: {
        name: 1,
        nameEn: 1,
        quantity: 1,
        revenueHuf: 1,
        orders: { $size: "$orderIds" },
      },
    },
    { $sort: { quantity: -1, revenueHuf: -1, _id: 1 } },
    { $limit: limit },
  ]).option({ maxTimeMS: 20_000 });
  return rows.map(({ _id, nameEn, ...row }) => ({
    itemId: String(_id),
    ...(nameEn ? { nameEn } : {}),
    ...row,
  }));
}

/**
 * The bartender report from the audit log of the state machine (T-021): who marked each order
 * Ready, their first and last order action per business day, and Preparing → Ready.
 */
export async function bartenderStats(
  venueId: string,
  range: DayRange,
): Promise<BartenderRow[]> {
  const orders = await Order.find(paidIn(venueId, range))
    .select("tipHuf businessDate")
    .lean();
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  // Served by the (target.type, target.id, createdAt) index; only PIN holders' actions count.
  const logs = await AuditLog.find({
    "target.type": "order",
    "target.id": { $in: orders.map((o) => o._id) },
    "actor.type": "venue_member",
    action: /^order\./,
  })
    .select("actor.id action target.id createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const preparingSince = new Map<string, number>();
  for (const log of logs) {
    if (!log.target) continue;
    const orderId = String(log.target.id);
    if (log.action === "order.start_preparing" && !preparingSince.has(orderId))
      preparingSince.set(orderId, log.createdAt.getTime());
  }

  type Acc = {
    days: Map<string, { first: number; last: number }>;
    ready: number;
    tipHuf: number;
    prepMs: number[];
  };
  const byMember = new Map<string, Acc>();
  for (const log of logs) {
    if (!log.actor?.id || !log.target) continue;
    const memberId = String(log.actor.id);
    const orderId = String(log.target.id);
    const order = orderOf.get(orderId)!;
    const at = log.createdAt.getTime();
    const acc: Acc = byMember.get(memberId) ?? {
      days: new Map(),
      ready: 0,
      tipHuf: 0,
      prepMs: [],
    };
    byMember.set(memberId, acc);
    const day = acc.days.get(order.businessDate);
    acc.days.set(order.businessDate, {
      first: Math.min(day?.first ?? at, at),
      last: Math.max(day?.last ?? at, at),
    });
    if (log.action === "order.mark_ready") {
      acc.ready += 1;
      acc.tipHuf += order.tipHuf ?? 0;
      const since = preparingSince.get(orderId);
      if (since !== undefined && since <= at) acc.prepMs.push(at - since);
    }
  }

  const members = await VenueMember.find({
    _id: { $in: [...byMember.keys()] },
    venueId,
  })
    .select("displayName")
    .lean();
  const name = new Map(members.map((m) => [String(m._id), m.displayName]));
  return [...byMember]
    .map(([memberId, acc]) => {
      const activeMs = [...acc.days.values()].reduce(
        (sum, d) => sum + (d.last - d.first),
        0,
      );
      return {
        memberId,
        name: name.get(memberId) ?? "",
        readyOrders: acc.ready,
        activeSeconds: Math.round(activeMs / 1000),
        ordersPerHour:
          activeMs > 0
            ? Math.round((acc.ready / (activeMs / 3_600_000)) * 10) / 10
            : null,
        avgPrepToReadySeconds: seconds(
          acc.prepMs.length
            ? acc.prepMs.reduce((a, b) => a + b, 0) / acc.prepMs.length
            : null,
        ),
        tipHuf: acc.tipHuf,
      };
    })
    .sort(
      (a, b) => b.readyOrders - a.readyOrders || a.name.localeCompare(b.name),
    );
}

/**
 * Wait time over the last `hours`, in `bucketMinutes` buckets by time of payment, oldest first
 * (for the dashboard, T-063). Rejected, refunded and expired orders that never got Ready are left out.
 */
export async function waitTimeTrend(
  venueId: string,
  now = new Date(),
  { hours = 3, bucketMinutes = 15 } = {},
): Promise<WaitBucket[]> {
  const bucketMs = bucketMinutes * 60_000;
  const end = Math.ceil(now.getTime() / bucketMs) * bucketMs;
  const start = end - hours * 3_600_000;
  const today = await venueBusinessDate(venueId, now);
  const orders = await Order.find({
    ...paidIn(venueId, { from: shiftDate(today, 1), to: today }),
    paidAt: { $gte: new Date(start), $lte: now },
  })
    .select("status paidAt readyAt")
    .lean();
  const buckets = Array.from({ length: (end - start) / bucketMs }, (_, i) => ({
    start: new Date(start + i * bucketMs),
    orders: 0,
    waits: [] as number[],
  }));
  for (const order of orders) {
    const bucket =
      buckets[Math.floor((order.paidAt!.getTime() - start) / bucketMs)];
    if (!bucket) continue;
    bucket.orders += 1;
    const until = order.readyAt
      ? order.readyAt.getTime()
      : ["new", "preparing"].includes(order.status)
        ? now.getTime()
        : null;
    if (until !== null) bucket.waits.push(until - order.paidAt!.getTime());
  }
  return buckets.map(({ start: at, orders: count, waits }) => ({
    start: at,
    orders: count,
    avgWaitSeconds: seconds(
      waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    ),
  }));
}

/** "m:ss" for a duration in seconds; "–" when there is none. */
export function durationText(totalSeconds: number | null): string {
  if (totalSeconds === null) return "–";
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
