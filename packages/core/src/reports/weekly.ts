import "server-only";

import { TZDate } from "@date-fns/tz";
import { User, Venue, VenueMember } from "@namitiszunk/db";

import type { Actor } from "../auth/permissions";
import { AppError } from "../errors";
import { businessDate } from "../orders/business-date";
import {
  type DayRange,
  percentChange,
  type ReportSummary,
  shiftDate,
  summarizeOrders,
  topProducts,
  venueClock,
} from "./aggregations";

/** The figures the weekly e-mail shows, from the same aggregation as the Reports module (T-061). */
export type WeeklyFigures = Pick<
  ReportSummary,
  | "orders"
  | "revenueHuf"
  | "tipHuf"
  | "avgBasketHuf"
  | "avgPrepSeconds"
  | "refundedOrders"
  | "refundedHuf"
>;

const compared = [
  "orders",
  "revenueHuf",
  "avgBasketHuf",
  "avgPrepSeconds",
  "tipHuf",
] as const;
export type WeeklyChange = Record<(typeof compared)[number], number | null>;

export type WeeklyReportMail = {
  template: "weeklyReport";
  to: string;
  data: {
    locale: "hu" | "en";
    venueName: string;
    /** Business days, "YYYY-MM-DD", Monday to Sunday. */
    from: string;
    to: string;
    current: WeeklyFigures;
    previous: WeeklyFigures;
    /** Whole percent from the week before, as the Reports comparison shows it; null without a base. */
    change: WeeklyChange;
    /** Top 5 by revenue before order-level discounts, as in the Reports module. */
    products: {
      name: string;
      nameEn?: string;
      quantity: number;
      revenueHuf: number;
    }[];
    url: string;
  };
  /** One mail per recipient and week, however often the job runs (Resend keeps the key 24 hours). */
  idempotencyKey: string;
};

/** Where the mail's button goes: the Owner's period report, or a Manager's daily report (spec 61). */
export type WeeklyReportLinks = {
  period: (week: DayRange, before: DayRange) => string;
  daily: (date: string) => string;
};

const TOP_PRODUCTS = 5;

/** Monday to Sunday of the calendar week before the one `today` falls in. */
export function lastWeek(today: string): DayRange {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shiftDate(today, ((weekday + 6) % 7) + 7);
  return { from: monday, to: shiftDate(monday, -6) };
}

const figures = (s: ReportSummary): WeeklyFigures => ({
  orders: s.orders,
  revenueHuf: s.revenueHuf,
  tipHuf: s.tipHuf,
  avgBasketHuf: s.avgBasketHuf,
  avgPrepSeconds: s.avgPrepSeconds,
  refundedOrders: s.refundedOrders,
  refundedHuf: s.refundedHuf,
});

const changeOf = (now: WeeklyFigures, before: WeeklyFigures): WeeklyChange =>
  Object.fromEntries(
    compared.map((key) => {
      const [a, b] = [now[key], before[key]];
      return [key, a === null || b === null ? null : percentChange(a, b)];
    }),
  ) as WeeklyChange;

/** Venues whose weekly report the Monday job builds. */
export async function weeklyReportVenues(): Promise<string[]> {
  const venues = await Venue.find({ status: "active" }).select("_id").lean();
  return venues.map((v) => String(v._id));
}

/**
 * Last week by the venue's calendar, and the moment its Sunday business day closes (Monday at the
 * venue's business day start): a venue that starts its day after the job's 09:00 is reported later.
 */
async function reportWeek(venueId: string, now: Date) {
  const clock = await venueClock(venueId);
  const week = lastWeek(
    businessDate(now, { ...clock, businessDayStart: "00:00" }),
  );
  const [year, month, day] = shiftDate(week.to, -1).split("-").map(Number);
  const [hours = 0, minutes = 0] = clock.businessDayStart
    .split(":")
    .map(Number);
  return {
    week,
    before: { from: shiftDate(week.from, 7), to: shiftDate(week.to, 7) },
    closesAt: new TZDate(
      year!,
      month! - 1,
      day!,
      hours,
      minutes,
      clock.timezone,
    ),
  };
}

/** When last week's final business day closes, as ISO time, if that is still ahead of `now`. */
export async function weeklyReportClosesAt(
  venueId: string,
  now: Date,
): Promise<string | null> {
  const { closesAt } = await reportWeek(venueId, now);
  return closesAt.getTime() > now.getTime()
    ? new Date(closesAt.getTime()).toISOString()
    : null;
}

/** Active Owners and Managers with an account whose switch is on (unset: Owners on, Managers off). */
async function subscribedMembers(venueId: string, userId?: string) {
  const members = await VenueMember.find({
    venueId,
    isActive: true,
    role: { $in: ["owner", "manager"] },
    userId: userId ?? { $type: "objectId" },
  })
    .select("role userId weeklyReport")
    .lean();
  return members.filter((m) => m.weeklyReport ?? m.role === "owner");
}

/**
 * Who gets last week's report of one venue, as user ids: nobody after a week without paid orders.
 * Only ids leave the job's steps, so the run history keeps no address or figures.
 */
export async function weeklyReportRecipients(
  venueId: string,
  now: Date,
): Promise<string[]> {
  const { week } = await reportWeek(venueId, now);
  if ((await summarizeOrders(venueId, week)).orders === 0) return [];
  const members = await subscribedMembers(venueId);
  return members.map((m) => String(m.userId));
}

/**
 * One recipient's mail, built at send time; null when they switched it off or have no address since.
 */
export async function weeklyReportMail(
  venueId: string,
  now: Date,
  userId: string,
  links: WeeklyReportLinks,
): Promise<WeeklyReportMail | null> {
  const [member] = await subscribedMembers(venueId, userId);
  const user = member
    ? await User.findOne({ _id: userId, email: { $type: "string" } })
        .select("email locale")
        .lean()
    : null;
  if (!member || !user?.email) return null;

  const { week, before } = await reportWeek(venueId, now);
  // shortcut: every mail repeats the venue's four report queries (recipient-free steps); fine for a few Owners and Managers, store the figures per venue and week once venues grow.
  const [current, previous, products, venue] = await Promise.all([
    summarizeOrders(venueId, week).then(figures),
    summarizeOrders(venueId, before).then(figures),
    topProducts(venueId, week, TOP_PRODUCTS),
    Venue.findById(venueId).select("name").lean(),
  ]);
  return {
    template: "weeklyReport",
    to: user.email,
    data: {
      locale: user.locale === "en" ? "en" : "hu",
      venueName: venue?.name ?? "",
      from: week.from,
      to: week.to,
      current,
      previous,
      change: changeOf(current, previous),
      products: products.map((p) => ({
        name: p.name,
        ...(p.nameEn ? { nameEn: p.nameEn } : {}),
        quantity: p.quantity,
        revenueHuf: p.revenueHuf,
      })),
      // A Manager sees one day at a time (T-061): their button opens the week's last day.
      url:
        member.role === "owner"
          ? links.period(week, before)
          : links.daily(week.to),
    },
    idempotencyKey: `weekly-report:${venueId}:${week.from}:${userId}`,
  };
}

/**
 * The signed-in Owner's or Manager's own membership; the e-mail goes to their own address only.
 * Stricter than any permission in permissions.ts (nobody switches someone else's), so not a can() check.
 */
function ownMembership(actor: Actor, venueId: string) {
  if (actor.kind !== "user") return undefined;
  return actor.memberships.find(
    (m) =>
      m.venueId === venueId && (m.role === "owner" || m.role === "manager"),
  );
}

/** Whether the actor gets the weekly report of this venue; null when they cannot (no own membership). */
export async function getWeeklyReport(
  actor: Actor,
  venueId: string,
): Promise<boolean | null> {
  const membership = ownMembership(actor, venueId);
  if (!membership) return null;
  const member = await VenueMember.findOne({
    _id: membership.memberId,
    venueId,
    isActive: true,
  })
    .select("weeklyReport")
    .lean();
  if (!member) return null;
  return member.weeklyReport ?? membership.role === "owner";
}

/** Switches the actor's own weekly report e-mail of this venue on or off. */
export async function setWeeklyReport(
  actor: Actor,
  venueId: string,
  on: boolean,
): Promise<void> {
  const membership = ownMembership(actor, venueId);
  if (!membership) throw new AppError(403, "forbidden");
  const updated = await VenueMember.updateOne(
    { _id: membership.memberId, venueId, isActive: true },
    { $set: { weeklyReport: on } },
  );
  if (updated.matchedCount === 0) throw new AppError(403, "forbidden");
}
