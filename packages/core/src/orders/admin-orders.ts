import "server-only";

import {
  AuditLog,
  Bar,
  Order,
  type OrderStatus,
  Payment,
  Refund,
  User,
  Venue,
  VenueMember,
  Zone,
} from "@namitiszunk/db";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { hitRateLimit, type RateLimitRule } from "../api/rate-limit";
import { auditActorOf } from "../audit/audit";
import { type Actor, can, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { type TableFile, writeTableFile } from "../export/table-file";
import { businessDate } from "./business-date";

// The Orders module (T-056): a manager's or owner's list, one order's details, and the export.
// Money moves only through the /v1 refund and reject routes; this file only reads.

export const ORDERS_PAGE_SIZE = 50;

// Paid orders only: awaiting_payment and cancelled (payment timeout) never took money.
const paid = { paidAt: { $type: "date" } } as const;

export type OrdersFilter = {
  /** YYYY-MM-DD; the venue's current business day when unset. */
  date?: string;
  number?: number;
  status?: OrderStatus;
  barId?: string;
  minHuf?: number;
  maxHuf?: number;
  /** "card" is a card without a wallet; the others match Payment.wallet. */
  method?: "card" | "apple_pay" | "google_pay";
  problem?: boolean;
  missingReceipt?: boolean;
  page?: number;
};

export type OrderRow = {
  id: string;
  shortNumber: number | null;
  status: OrderStatus;
  paidAt: Date;
  barName: string;
  totalHuf: number;
  refundedHuf: number;
  problemCount: number;
  receiptEntered: boolean;
};

export type OrdersPage = {
  businessDate: string;
  /** The venue's bars, for the bar filter. */
  bars: { id: string; name: string }[];
  orders: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
};

async function todayOf(venueId: string, now: Date): Promise<string> {
  const venue = await Venue.findById(venueId)
    .select("timezone businessDayStart")
    .lean();
  if (!venue) throw new NotFoundError();
  return businessDate(now, {
    timezone: venue.timezone ?? "Europe/Budapest",
    businessDayStart: venue.businessDayStart ?? "06:00",
  });
}

async function refundedByOrder(
  orderIds: readonly unknown[],
): Promise<Map<string, number>> {
  const rows = await Refund.aggregate<{ _id: unknown; huf: number }>([
    { $match: { orderId: { $in: orderIds }, status: "succeeded" } },
    { $group: { _id: "$orderId", huf: { $sum: "$amountHuf" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.huf]));
}

async function barNames(venueId: string): Promise<Map<string, string>> {
  const bars = await Bar.find({ venueId }).select("name").lean();
  return new Map(bars.map((bar) => [String(bar._id), bar.name]));
}

/** One business day's paid orders, newest first, with the module's filters. */
export async function listVenueOrders(
  actor: Actor,
  venueId: string,
  filter: OrdersFilter = {},
  now = new Date(),
): Promise<OrdersPage> {
  requirePermission(actor, "order.viewHistory", { venueId });
  const day = filter.date ?? (await todayOf(venueId, now));
  const page = filter.page ?? 1;
  const query: Record<string, unknown> = {
    venueId,
    businessDate: day,
    ...paid,
    ...(filter.number !== undefined && { shortNumber: filter.number }),
    ...(filter.status && { status: filter.status }),
    ...(filter.barId && { barId: filter.barId }),
    ...((filter.minHuf !== undefined || filter.maxHuf !== undefined) && {
      totalHuf: {
        ...(filter.minHuf !== undefined && { $gte: filter.minHuf }),
        ...(filter.maxHuf !== undefined && { $lte: filter.maxHuf }),
      },
    }),
    // Missing only once the bar took the order on (Készül or later); a rejected New order never needed one.
    ...(filter.missingReceipt && {
      acceptedAt: { $type: "date" },
      receiptEnteredBy: { $exists: false },
    }),
    ...(filter.problem && { "problemReports.0": { $exists: true } }),
  };
  if (filter.method) {
    // The method lives on the Payment: narrow to the day's orders first, so the lookup stays small.
    const dayIds = await Order.find(query).distinct("_id");
    query._id = {
      $in: await Payment.find({
        orderId: { $in: dayIds },
        // null matches a missing wallet too: a plain card payment.
        wallet: filter.method === "card" ? null : filter.method,
      }).distinct("orderId"),
    };
  }
  const [orders, total, bars] = await Promise.all([
    Order.find(query)
      .select(
        "shortNumber status paidAt barId totalHuf problemReports.category receiptEnteredBy",
      )
      .sort({ paidAt: -1 })
      .skip((page - 1) * ORDERS_PAGE_SIZE)
      .limit(ORDERS_PAGE_SIZE)
      .lean(),
    Order.countDocuments(query),
    barNames(venueId),
  ]);
  const refunded = await refundedByOrder(orders.map((order) => order._id));
  return {
    businessDate: day,
    bars: [...bars].map(([id, name]) => ({ id, name })),
    total,
    page,
    pageSize: ORDERS_PAGE_SIZE,
    orders: orders.map((order) => ({
      id: String(order._id),
      shortNumber: order.shortNumber ?? null,
      status: order.status,
      paidAt: order.paidAt!,
      barName: bars.get(String(order.barId)) ?? "",
      totalHuf: order.totalHuf,
      refundedHuf: refunded.get(String(order._id)) ?? 0,
      problemCount: order.problemReports?.length ?? 0,
      receiptEntered: Boolean(order.receiptEnteredBy),
    })),
  };
}

/** `k***@gmail.com`: enough to match a complaint, not enough to contact the guest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * `+36 30 *** **12`: the country and area code and the last two digits stay. Fails closed: a
 * number that does not parse keeps only its last two digits.
 */
export function maskPhone(phone: string): string {
  const groups = parsePhoneNumberFromString(phone)
    ?.formatInternational()
    .split(" ");
  const digits = phone.replace(/\D/g, "");
  if (!groups || groups.length < 3) return `*** **${digits.slice(-2)}`;
  const [country, area, ...rest] = groups;
  const tail = rest.join(" ");
  const keepFrom = tail.replace(/\D/g, "").length - 2;
  let digit = 0;
  const masked = tail.replace(/\d/g, (d) => (digit++ < keepFrom ? "*" : d));
  return `${country} ${area} ${masked}`;
}

/** A venue member by name; anyone else only by kind, so HQ staff and guests stay unnamed. */
export type Who = {
  kind: "staff" | "platform" | "guest" | "system";
  name: string | null;
};

export type OrderDetail = {
  id: string;
  shortNumber: number | null;
  businessDate: string;
  status: OrderStatus;
  isVip: boolean;
  barName: string;
  tableName: string | null;
  items: {
    name: string;
    quantity: number;
    options: string[];
    unitPriceHuf: number;
    lineTotalHuf: number;
  }[];
  amounts: {
    subtotalHuf: number;
    discountHuf: number;
    serviceFeeHuf: number;
    tipHuf: number;
    totalHuf: number;
    refundedHuf: number;
    platformFeeHuf: number;
  };
  payment: {
    paymentIntentId: string;
    /** Stripe's wallet type (apple_pay, google_pay, …), translated by the page. */
    wallet: string | null;
    /** Brand and last 4 digits, e.g. "visa •4242". */
    card: string | null;
  } | null;
  guest: { email: string | null; phone: string | null };
  receipt: { by: string | null; at: Date } | null;
  rejectionReason: string | null;
  problemReports: { category: string; message: string | null; at: Date }[];
  refunds: {
    id: string;
    amountHuf: number;
    reason: string;
    status: "pending" | "succeeded" | "failed";
    at: Date;
    by: Who;
  }[];
  timeline: { action: string; at: Date; by: Who }[];
  /** What this actor may do from the page; the API checks again. */
  can: { refund: boolean; refundableHuf: number; cancel: boolean };
};

// Mongoose types embedded actors as optional; a missing one reads as the system.
type ActorRef = { type: string; id?: unknown } | null | undefined;

async function namesOf(
  venueId: string,
  refs: readonly ActorRef[],
): Promise<(ref: ActorRef) => Who> {
  const ids = (type: string) => [
    ...new Set(
      refs.filter((r) => r?.type === type && r.id).map((r) => String(r!.id)),
    ),
  ];
  // A signed-in manager or owner acts as a User; their name comes from this venue's membership.
  const members = await VenueMember.find({
    venueId,
    $or: [
      { _id: { $in: ids("venue_member") } },
      { userId: { $in: ids("user") } },
    ],
  })
    .select("displayName userId")
    .lean();
  const byMember = new Map(members.map((m) => [String(m._id), m.displayName]));
  const byUser = new Map(
    members
      .filter((m) => m.userId)
      .map((m) => [String(m.userId), m.displayName]),
  );
  return (ref) => {
    if (ref?.type === "venue_member")
      return { kind: "staff", name: byMember.get(String(ref.id)) ?? null };
    if (ref?.type === "user" && ref.id) {
      const name = byUser.get(String(ref.id));
      return name ? { kind: "staff", name } : { kind: "platform", name: null };
    }
    if (ref?.type === "user") return { kind: "guest", name: null };
    if (ref?.type === "platform_member")
      return { kind: "platform", name: null };
    return { kind: "system", name: null };
  };
}

/** One order with everything the module shows. Another venue's order is "not found". */
export async function getVenueOrder(
  actor: Actor,
  orderId: string,
): Promise<OrderDetail> {
  const order = await Order.findById(orderId).lean();
  if (
    !order ||
    !order.paidAt ||
    !can(actor, "order.viewHistory", { venueId: String(order.venueId) })
  )
    throw new NotFoundError();
  const venueId = String(order.venueId);

  const [bar, zone, payment, refunds, user] = await Promise.all([
    Bar.findById(order.barId).select("name").lean(),
    order.zoneId ? Zone.findById(order.zoneId).select("name").lean() : null,
    Payment.findOne({ orderId: order._id })
      .select(
        "stripePaymentIntentId amountHuf applicationFeeHuf cardBrand cardLast4 wallet",
      )
      .lean(),
    Refund.find({ orderId: order._id }).sort({ createdAt: 1 }).lean(),
    order.userId ? User.findById(order.userId).select("email").lean() : null,
  ]);
  const log = await AuditLog.find({
    "target.id": { $in: [order._id, ...refunds.map((r) => r._id)] },
  })
    .select("actor action createdAt")
    .sort({ _id: 1 })
    .lean();
  const who = await namesOf(venueId, [
    ...log.map((entry) => entry.actor),
    ...refunds.map((r) => r.initiatedBy),
    ...(order.receiptEnteredBy
      ? [{ type: "venue_member", id: order.receiptEnteredBy }]
      : []),
  ]);

  const refundedHuf = refunds
    .filter((r) => r.status === "succeeded")
    .reduce((sum, r) => sum + r.amountHuf, 0);
  const committedHuf = refunds
    .filter((r) => r.status !== "failed")
    .reduce((sum, r) => sum + r.amountHuf, 0);
  // The same base as refundOrder: what the Payment took, minus refunds not failed.
  const refundableHuf = Math.max(
    0,
    (payment?.amountHuf ?? order.totalHuf) - committedHuf,
  );

  return {
    id: String(order._id),
    shortNumber: order.shortNumber ?? null,
    businessDate: order.businessDate,
    status: order.status,
    isVip: order.isVip ?? false,
    barName: bar?.name ?? "",
    tableName: zone?.name ?? null,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      options: (item.options ?? []).map((o) => o.name),
      unitPriceHuf: item.unitPriceHuf,
      lineTotalHuf: item.lineTotalHuf,
    })),
    amounts: {
      subtotalHuf: order.subtotalHuf,
      discountHuf: order.discountHuf ?? 0,
      serviceFeeHuf: order.serviceFeeHuf ?? 0,
      tipHuf: order.tipHuf ?? 0,
      totalHuf: order.totalHuf,
      refundedHuf,
      platformFeeHuf: payment?.applicationFeeHuf ?? 0,
    },
    payment: payment
      ? {
          paymentIntentId: payment.stripePaymentIntentId,
          wallet: payment.wallet ?? null,
          card:
            [payment.cardBrand, payment.cardLast4 && `•${payment.cardLast4}`]
              .filter(Boolean)
              .join(" ") || null,
        }
      : null,
    guest: {
      email: user?.email ? maskEmail(user.email) : null,
      phone: order.guestPhone ? maskPhone(order.guestPhone) : null,
    },
    receipt:
      order.receiptEnteredBy && order.receiptEnteredAt
        ? {
            by: who({ type: "venue_member", id: order.receiptEnteredBy }).name,
            at: order.receiptEnteredAt,
          }
        : null,
    rejectionReason: order.rejectionReason ?? null,
    problemReports: (order.problemReports ?? []).map((report) => ({
      category: report.category,
      message: report.message ?? null,
      at: report.createdAt,
    })),
    refunds: refunds.map((refund) => ({
      id: String(refund._id),
      amountHuf: refund.amountHuf,
      reason: refund.reason,
      status: refund.status,
      at: refund.createdAt,
      by: who(refund.initiatedBy),
    })),
    timeline: log.map((entry) => ({
      action: entry.action,
      at: entry.createdAt,
      by: who(entry.actor),
    })),
    can: {
      // The amount is checked again with the venue's limit when the refund starts.
      refund:
        refundableHuf > 0 &&
        (order.status === "picked_up" || order.status === "expired") &&
        can(actor, "order.refund", {
          venueId,
          amountHuf: 1,
          managerRefundLimitHuf: null,
        }),
      refundableHuf,
      cancel: order.status === "new" && can(actor, "order.reject", { venueId }),
    },
  };
}

export const exportColumns = [
  "paidAt",
  "businessDate",
  "shortNumber",
  "bar",
  "status",
  "subtotalHuf",
  "discountHuf",
  "serviceFeeHuf",
  "tipHuf",
  "totalHuf",
  "platformFeeHuf",
  "refundedHuf",
  "paymentMethod",
  "receiptEnteredBy",
] as const;
export type ExportColumn = (typeof exportColumns)[number];

export type ExportLabels = {
  columns: Record<ExportColumn, string>;
  status: Record<OrderStatus, string>;
  /** "card" and Stripe wallet types; an unknown wallet shows as stored. */
  methods: Record<string, string>;
  /** File name before the dates, and the Excel sheet's name. */
  filename: string;
  sheet: string;
};

// One file fits a serverless response (4.5 MB) and memory; a bigger venue exports shorter ranges.
export const EXPORT_MAX_ROWS = 20_000;
const EXPORT_RATE: RateLimitRule = { limit: 10, windowSeconds: 60 };

export type OrdersExport = TableFile;

/**
 * Paid orders of business days `from`–`to` for the books: amounts in whole forints, no guest data.
 * Column titles and status names come from the caller in the user's language.
 */
export async function exportVenueOrders(
  actor: Actor,
  venueId: string,
  range: { from: string; to: string; format: "csv" | "xlsx" },
  labels: ExportLabels,
): Promise<OrdersExport> {
  requirePermission(actor, "order.viewHistory", { venueId });
  // Heavy reads: a few per minute per person is plenty for the books.
  if (
    await hitRateLimit(
      `orders-export:${JSON.stringify(auditActorOf(actor))}`,
      EXPORT_RATE,
    )
  )
    throw new AppError(429, "rate_limited");
  const venue = await Venue.findById(venueId).select("timezone").lean();
  if (!venue) throw new NotFoundError();
  const query = {
    venueId,
    businessDate: { $gte: range.from, $lte: range.to },
    ...paid,
  };
  if ((await Order.countDocuments(query)) > EXPORT_MAX_ROWS)
    throw new ConflictError("export_too_large");
  const orders = await Order.find(query)
    .maxTimeMS(20_000)
    .select(
      "shortNumber businessDate status paidAt barId subtotalHuf discountHuf serviceFeeHuf tipHuf totalHuf receiptEnteredBy",
    )
    .sort({ paidAt: 1 })
    .lean();
  const ids = orders.map((order) => order._id);
  const [bars, refunded, payments, members] = await Promise.all([
    barNames(venueId),
    refundedByOrder(ids),
    Payment.find({ orderId: { $in: ids } })
      .select("orderId applicationFeeHuf cardBrand wallet")
      .lean(),
    VenueMember.find({ venueId }).select("displayName").lean(),
  ]);
  const paymentOf = new Map(payments.map((p) => [String(p.orderId), p]));
  const memberName = new Map(
    members.map((m) => [String(m._id), m.displayName]),
  );
  const time = new Intl.DateTimeFormat("sv-SE", {
    timeZone: venue.timezone ?? "Europe/Budapest",
    dateStyle: "short",
    timeStyle: "short",
  });

  const rows = orders.map((order) => {
    const payment = paymentOf.get(String(order._id));
    const row: Record<ExportColumn, string | number> = {
      paidAt: time.format(order.paidAt!),
      businessDate: order.businessDate,
      shortNumber: order.shortNumber ?? "",
      bar: bars.get(String(order.barId)) ?? "",
      status: labels.status[order.status],
      subtotalHuf: order.subtotalHuf,
      discountHuf: order.discountHuf ?? 0,
      serviceFeeHuf: order.serviceFeeHuf ?? 0,
      tipHuf: order.tipHuf ?? 0,
      totalHuf: order.totalHuf,
      platformFeeHuf: payment?.applicationFeeHuf ?? 0,
      refundedHuf: refunded.get(String(order._id)) ?? 0,
      paymentMethod: !payment
        ? ""
        : payment.wallet
          ? (labels.methods[payment.wallet] ?? payment.wallet)
          : [labels.methods.card, payment.cardBrand].filter(Boolean).join(" "),
      receiptEnteredBy: order.receiptEnteredBy
        ? (memberName.get(String(order.receiptEnteredBy)) ?? "")
        : "",
    };
    return exportColumns.map((column) => row[column]);
  });
  return writeTableFile({
    header: exportColumns.map((column) => labels.columns[column]),
    rows,
    hufColumns: exportColumns.map((column) => column.endsWith("Huf")),
    format: range.format,
    filename: `${labels.filename}-${range.from}_${range.to}`,
    sheet: labels.sheet,
  });
}
