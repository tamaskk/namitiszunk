import "server-only";

import { Order, Refund, Venue } from "@namitiszunk/db";
import type { ClientSession } from "@namitiszunk/db";

import { audit, auditActorOf } from "../audit/audit";
import { type Actor, can, requirePermission } from "../auth/permissions";
import { NotFoundError } from "../errors";

type UserActor = Extract<Actor, { kind: "user" }>;

export type AdminVenue = {
  id: string;
  name: string;
  /** For links to the guest menu (the menu editor's preview). */
  slug: string;
  /** The venue-wide pause (T-050): set means no bar takes orders until it is switched back. */
  ordersPausedAt: Date | null;
};

/** The venues the signed-in member belongs to, by name; the venue switcher and the pause switch read this. */
export async function listAdminVenues(actor: UserActor): Promise<AdminVenue[]> {
  const ids = actor.memberships.map((m) => m.venueId);
  if (ids.length === 0) return [];
  const venues = await Venue.find(
    { _id: { $in: ids } },
    { name: 1, slug: 1, ordersPausedAt: 1 },
  )
    .sort({ name: 1 })
    .lean();
  return venues.map((v) => ({
    id: String(v._id),
    name: v.name,
    slug: v.slug,
    ordersPausedAt: v.ordersPausedAt ?? null,
  }));
}

/**
 * Pauses or resumes ordering at every bar of the venue, with no time limit (T-050). The per-bar
 * 5 / 10 / 15 minute pause in the bar view (T-054) is separate and stays as it is.
 */
export async function setVenueOrdersPaused(
  actor: Actor,
  {
    venueId,
    paused,
    now = new Date(),
  }: { venueId: string; paused: boolean; now?: Date },
): Promise<{ ordersPausedAt: Date | null }> {
  requirePermission(actor, "venue.pauseOrders", { venueId });
  const session: ClientSession = await Venue.startSession();
  let ordersPausedAt: Date | null = null;
  try {
    await session.withTransaction(async () => {
      const before = await Venue.findById(venueId, { ordersPausedAt: 1 })
        .session(session)
        .lean();
      if (!before) throw new NotFoundError();
      const was = before.ordersPausedAt ?? null;
      // Pausing twice keeps the first time, so the dashboard shows how long it has been on.
      ordersPausedAt = paused ? (was ?? now) : null;
      if (Boolean(was) === paused) return;
      await Venue.updateOne(
        { _id: venueId },
        paused
          ? { $set: { ordersPausedAt } }
          : { $unset: { ordersPausedAt: 1 } },
        { session },
      );
      await audit(session, {
        actor: auditActorOf(actor),
        venueId,
        action: paused ? "venue.ordersPaused" : "venue.ordersResumed",
        target: { type: "venue", id: venueId },
        before: { ordersPausedAt: was },
        after: { ordersPausedAt },
      });
    });
  } finally {
    await session.endSession();
  }
  return { ordersPausedAt };
}

const NOTIFICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIFICATION_LIMIT = 20;
const REPORTED_ORDERS_CAP = 100;

export type AdminNotification = {
  kind: "problemReport" | "refundFailed";
  orderId: string;
  shortNumber: number | null;
  at: Date;
};

/**
 * The bell in the Admin top bar: guest problem reports (T-046) and failed refunds (T-034) of the
 * last 7 days, newest first. Orders without a receipt mark join with the Orders module (T-056).
 * No message text or e-mail address: the order page shows those to whoever may open it.
 */
export async function listAdminNotifications(
  actor: Actor,
  { venueId, now = new Date() }: { venueId: string; now?: Date },
): Promise<AdminNotification[]> {
  requirePermission(actor, "order.start", { venueId });
  // Failed refunds only for roles that may refund at all (any limit counts here).
  const seesRefunds = can(actor, "order.refund", {
    venueId,
    managerRefundLimitHuf: null,
  });
  const since = new Date(now.getTime() - NOTIFICATION_WINDOW_MS);
  // shortcut: no index on problemReports.createdAt; venueId narrows it. Add one if a venue's 7 days get slow.
  const [reported, refunds] = await Promise.all([
    Order.find({
      venueId,
      problemReports: { $elemMatch: { createdAt: { $gte: since } } },
    })
      // Report dates only: the guest's message and e-mail address never leave the database here.
      .select("shortNumber problemReports.createdAt")
      // shortcut: newest by updatedAt, capped; sorted by report time below. Aggregate if a venue gets more.
      .sort({ updatedAt: -1 })
      .limit(REPORTED_ORDERS_CAP)
      .lean(),
    seesRefunds
      ? Refund.find(
          { venueId, status: "failed", updatedAt: { $gte: since } },
          { orderId: 1, updatedAt: 1 },
        )
          .sort({ updatedAt: -1 })
          .limit(NOTIFICATION_LIMIT)
          .lean()
      : [],
  ]);
  const refundOrders = await Order.find(
    { venueId, _id: { $in: refunds.map((r) => r.orderId) } },
    { shortNumber: 1 },
  ).lean();
  const shortNumberOf = new Map(
    refundOrders.map((o) => [String(o._id), o.shortNumber ?? null]),
  );

  const items: AdminNotification[] = [
    ...reported.map((o) => ({
      kind: "problemReport" as const,
      orderId: String(o._id),
      shortNumber: o.shortNumber ?? null,
      at: o.problemReports
        .map((r) => r.createdAt)
        .reduce((a, b) => (a > b ? a : b)),
    })),
    ...refunds.map((r) => ({
      kind: "refundFailed" as const,
      orderId: String(r.orderId),
      shortNumber: shortNumberOf.get(String(r.orderId)) ?? null,
      at: r.updatedAt,
    })),
  ];
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, NOTIFICATION_LIMIT);
}
