import "server-only";

import {
  Bar,
  type ClientSession,
  Item,
  Order,
  Venue,
  VenueMember,
} from "@namitiszunk/db";

import { audit, auditActorOf } from "../audit/audit";
import {
  type Action,
  type Actor,
  can,
  requirePermission,
} from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { type NotifyDeps, sendPickupReminder } from "../jobs/order-jobs";
import { inTransaction, setItemAvailable } from "../menu/admin-menu";
import { businessDate } from "../orders/business-date";
import { transition } from "../orders/transition";
import { publishBarUpdate } from "../realtime";
import { reportError } from "../report-error";

// The bar view (T-054): the tablet's list and the changes that are not plain status changes.
// Start, Ready and Picked up are transition() calls; everything here is audited, and every
// change other tablets must see is announced on the bar channel after it commits.

export type BarViewOrder = {
  id: string;
  shortNumber: number | null;
  status: "new" | "preparing" | "ready" | "expired";
  /** Order.updatedAt in epoch ms, compared with realtime messages. */
  version: number;
  isVip: boolean;
  /** Any item with alcohol: the card shows 18+ so the bartender checks the guest's age. */
  adult: boolean;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    options: string[];
  }[];
  /** When it reached the bar (paid); the card's waiting colour counts from here. */
  paidAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  receiptEnteredBy: string | null;
  reminderSentAt: string | null;
};

export type BarView = {
  bar: {
    id: string;
    name: string;
    pausedUntil: string | null;
    maxActiveOrders: number | null;
  };
  /** The venue's other bars, for moving an order. */
  otherBars: { id: string; name: string }[];
  /** The venue's sold-out switches ("Termékek" drawer): live items sold at this bar. */
  products: { id: string; name: string; isAvailable: boolean }[];
  orders: BarViewOrder[];
  /** Mean minutes from acceptance to Ready today, or null before the first one. */
  averagePrepMinutes: number | null;
};

const shownStatuses = ["new", "preparing", "ready", "expired"] as const;

/** The member an action is logged to: the PIN holder, or the signed-in member of this venue. */
function memberIdOf(actor: Actor, venueId: string): string | null {
  if (actor.kind === "staff") return actor.memberId;
  if (actor.kind === "user")
    return (
      actor.memberships.find((m) => m.venueId === venueId)?.memberId ?? null
    );
  return null;
}

async function loadBar(barId: string) {
  const bar = await Bar.findById(barId)
    .select("venueId name pausedUntil maxActiveOrders")
    .lean();
  if (!bar) throw new NotFoundError();
  return bar;
}

/**
 * The order with its venue, for a check that runs before the write. An order the actor may not act
 * on answers 404 like a missing one, so a guessed id never tells whether it exists (ids are in guest links).
 */
async function loadOrderFor(
  actor: Actor,
  orderId: string,
  action: Action,
  fields = "venueId barId status",
) {
  const order = await Order.findById(orderId).select(fields).lean();
  if (!order || !can(actor, action, { venueId: String(order.venueId) }))
    throw new NotFoundError();
  return order;
}

/** Announces a committed change; a lost message only delays the other tablets until their next sync. */
async function announce(input: Parameters<typeof publishBarUpdate>[0]) {
  try {
    await publishBarUpdate(input);
  } catch (error) {
    reportError(error);
  }
}

/** The bar picker on /pult: the venue's bars, and who holds the PIN on this tablet. */
export async function getBarPicker(
  actor: Actor,
  venueId: string,
): Promise<{ bars: { id: string; name: string }[]; staffName: string | null }> {
  requirePermission(actor, "order.start", { venueId });
  const [bars, member] = await Promise.all([
    Bar.find({ venueId }).select("name").sort({ _id: 1 }).lean(),
    actor.kind === "staff"
      ? VenueMember.findOne({ _id: actor.memberId, venueId })
          .select("displayName")
          .lean()
      : null,
  ]);
  return {
    bars: bars.map((b) => ({ id: String(b._id), name: b.name })),
    staffName: member?.displayName ?? null,
  };
}

/** One bar's orders of the current business day, newest last in each column. */
export async function getBarView(
  actor: Actor,
  barId: string,
  now = new Date(),
): Promise<BarView> {
  const bar = await loadBar(barId);
  const venueId = String(bar.venueId);
  requirePermission(actor, "order.start", { venueId });

  const venue = await Venue.findById(venueId)
    .select("timezone businessDayStart")
    .lean();
  if (!venue) throw new NotFoundError();
  const day = businessDate(now, {
    timezone: venue.timezone ?? "Europe/Budapest",
    businessDayStart: venue.businessDayStart ?? "06:00",
  });

  const [orders, done, otherBars, products] = await Promise.all([
    Order.find({
      venueId,
      barId,
      businessDate: day,
      status: { $in: shownStatuses },
    })
      .select(
        "shortNumber status updatedAt isVip items.itemId items.name items.quantity items.options paidAt createdAt acceptedAt readyAt receiptEnteredBy reminderSentAt",
      )
      .sort({ createdAt: 1 })
      .lean(),
    // Prep times of today's finished orders; the same index as the list.
    Order.find({
      venueId,
      barId,
      businessDate: day,
      status: { $in: ["ready", "picked_up", "expired"] },
      acceptedAt: { $ne: null },
      readyAt: { $ne: null },
    })
      .select("acceptedAt readyAt")
      .lean(),
    Bar.find({ venueId, _id: { $ne: barId } })
      .select("name")
      .sort({ _id: 1 })
      .lean(),
    Item.find({ venueId, archivedAt: null, barIds: barId })
      .select("name isAvailable")
      .sort({ name: 1 })
      .lean(),
  ]);

  const itemIds = [
    ...new Set(orders.flatMap((o) => o.items.map((i) => String(i.itemId)))),
  ];
  const memberIds = [
    ...new Set(
      orders.flatMap((o) =>
        o.receiptEnteredBy ? [String(o.receiptEnteredBy)] : [],
      ),
    ),
  ];
  const [alcoholic, members] = await Promise.all([
    Item.find({ _id: { $in: itemIds }, alcoholPercent: { $gt: 0 } })
      .select("_id")
      .lean(),
    VenueMember.find({ _id: { $in: memberIds }, venueId })
      .select("displayName")
      .lean(),
  ]);
  const adultItems = new Set(alcoholic.map((i) => String(i._id)));
  const names = new Map(members.map((m) => [String(m._id), m.displayName]));

  const prep = done.map((o) => o.readyAt!.getTime() - o.acceptedAt!.getTime());
  const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

  return {
    bar: {
      id: barId,
      name: bar.name,
      pausedUntil:
        bar.pausedUntil && bar.pausedUntil > now
          ? bar.pausedUntil.toISOString()
          : null,
      maxActiveOrders: bar.maxActiveOrders ?? null,
    },
    otherBars: otherBars.map((b) => ({ id: String(b._id), name: b.name })),
    products: products.map((p) => ({
      id: String(p._id),
      name: p.name,
      isAvailable: p.isAvailable ?? true,
    })),
    orders: orders.map((o) => ({
      id: String(o._id),
      shortNumber: o.shortNumber ?? null,
      status: o.status as BarViewOrder["status"],
      version: o.updatedAt.getTime(),
      isVip: o.isVip ?? false,
      adult: o.items.some((i) => adultItems.has(String(i.itemId))),
      items: o.items.map((i) => ({
        itemId: String(i.itemId),
        name: i.name,
        quantity: i.quantity,
        options: (i.options ?? []).map((opt) => opt.name),
      })),
      paidAt: (o.paidAt ?? o.createdAt).toISOString(),
      acceptedAt: iso(o.acceptedAt),
      readyAt: iso(o.readyAt),
      receiptEnteredBy: o.receiptEnteredBy
        ? (names.get(String(o.receiptEnteredBy)) ?? "")
        : null,
      reminderSentAt: iso(o.reminderSentAt),
    })),
    averagePrepMinutes:
      prep.length === 0
        ? null
        : Math.round(prep.reduce((a, b) => a + b, 0) / prep.length / 60_000),
  };
}

/** The "receipt entered" mark (T-026): logged to the PIN holder; the bartender can take it back. */
export async function setReceiptEntered(
  actor: Actor,
  orderId: string,
  entered: boolean,
  now = new Date(),
): Promise<void> {
  const order = await loadOrderFor(actor, orderId, "order.markReceipt");
  const venueId = String(order.venueId);
  const memberId = memberIdOf(actor, venueId);
  if (entered && !memberId) throw new AppError(403, "forbidden");

  await inTransaction(async (session) => {
    const updated = await Order.updateOne(
      { _id: orderId, venueId, status: { $in: ["preparing", "ready"] } },
      entered
        ? { $set: { receiptEnteredAt: now, receiptEnteredBy: memberId } }
        : { $unset: { receiptEnteredAt: 1, receiptEnteredBy: 1 } },
      { session },
    );
    if (updated.matchedCount === 0) throw new ConflictError("invalid_status");
    await auditOrder(session, actor, venueId, orderId, {
      action: entered ? "order.receiptEntered" : "order.receiptCleared",
    });
  });
  await announce({ venueId, barIds: [String(order.barId)] });
}

/** The bar's own pause (T-054): 5, 10 or 15 minutes; 0 takes it back. */
export async function setBarPaused(
  actor: Actor,
  barId: string,
  minutes: 0 | 5 | 10 | 15,
  now = new Date(),
): Promise<{ pausedUntil: string | null }> {
  const bar = await loadBar(barId);
  const venueId = String(bar.venueId);
  requirePermission(actor, "bar.pauseOrders", { venueId });
  const pausedUntil =
    minutes === 0 ? null : new Date(now.getTime() + minutes * 60_000);

  await inTransaction(async (session) => {
    await Bar.updateOne(
      { _id: barId, venueId },
      pausedUntil ? { $set: { pausedUntil } } : { $unset: { pausedUntil: 1 } },
      { session },
    );
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: minutes === 0 ? "bar.resumed" : "bar.paused",
      target: { type: "bar", id: barId },
      after: { minutes },
    });
  });
  await announce({ venueId, barIds: [barId] });
  return { pausedUntil: pausedUntil?.toISOString() ?? null };
}

/** Moves a waiting order to another bar of the venue (T-054 case 7); the guest page follows. */
export async function moveOrderToBar(
  actor: Actor,
  orderId: string,
  toBarId: string,
): Promise<void> {
  const order = await loadOrderFor(actor, orderId, "order.moveBar");
  const venueId = String(order.venueId);
  const fromBarId = String(order.barId);
  if (fromBarId === toBarId) throw new ConflictError("same_bar");
  const target = await Bar.findOne({ _id: toBarId, venueId })
    .select("_id")
    .lean();
  if (!target) throw new NotFoundError();

  await inTransaction(async (session) => {
    const updated = await Order.updateOne(
      {
        _id: orderId,
        venueId,
        barId: fromBarId,
        status: { $in: ["new", "preparing", "ready"] },
      },
      { $set: { barId: toBarId } },
      { session },
    );
    if (updated.matchedCount === 0) throw new ConflictError("invalid_status");
    await auditOrder(session, actor, venueId, orderId, {
      action: "order.movedBar",
      before: { barId: fromBarId },
      after: { barId: toBarId },
    });
  });
  await announce({ venueId, barIds: [fromBarId, toBarId], orderId });
}

/** The Ready card's reminder button: sends now, once; 409 when it already went out or the order left Ready. */
export async function sendReminderFromBar(
  actor: Actor,
  orderId: string,
  deps: NotifyDeps,
): Promise<"push" | "sms" | "none"> {
  const order = await loadOrderFor(actor, orderId, "order.sendReminder");
  const venueId = String(order.venueId);
  const sent = await sendPickupReminder(orderId, deps);
  if (sent === "skipped") throw new ConflictError("reminder_not_sendable");
  // The reminder is out and cannot be taken back: a failed audit is reported, not a 500 to the bar.
  try {
    await inTransaction((session) =>
      auditOrder(session, actor, venueId, orderId, {
        action: "order.reminderSent",
        after: { channel: sent },
      }),
    );
  } catch (error) {
    reportError(error);
  }
  await announce({ venueId, barIds: [String(order.barId)] });
  return sent;
}

export type RejectReason = "sold_out" | "other";

/**
 * Staff rejects a New order with a reason; the reject hook refunds the full amount (T-034).
 * "sold_out" also marks the chosen items of the order sold out, so the next guest cannot order them.
 */
export async function rejectFromBar(
  actor: Actor,
  orderId: string,
  input: { reason: RejectReason; soldOutItemIds?: readonly string[] },
): Promise<void> {
  const order = await loadOrderFor(
    actor,
    orderId,
    "order.reject",
    "venueId status items.itemId",
  );
  const venueId = String(order.venueId);
  // Spec: rejection only from the New column; the state machine alone would also allow it later for a guest.
  if (order.status !== "new") throw new ConflictError("invalid_status");
  const orderItems = new Set(order.items.map((i) => String(i.itemId)));
  const soldOut =
    input.reason === "sold_out" ? [...new Set(input.soldOutItemIds ?? [])] : [];
  if (input.reason === "sold_out" && soldOut.length === 0)
    throw new AppError(400, "validation_failed", {
      soldOutItemIds: "validation.required",
    });
  if (soldOut.some((id) => !orderItems.has(id)))
    throw new AppError(400, "validation_failed", {
      soldOutItemIds: "validation.invalid",
    });

  // The guest sees the reason on the live page in their own language; transition() stores it as given.
  await transition(orderId, "reject", actor, { reason: input.reason });
  // The rejection and its refund are committed: a failed sold-out mark is reported, not sent back to the bar as a failure.
  for (const itemId of soldOut) {
    try {
      await setItemAvailable(actor, venueId, itemId, false);
    } catch (error) {
      reportError(error);
    }
  }
}

async function auditOrder(
  session: ClientSession,
  actor: Actor,
  venueId: string,
  orderId: string,
  entry: { action: string; before?: unknown; after?: unknown },
) {
  await audit(session, {
    actor: auditActorOf(actor),
    venueId,
    action: entry.action,
    target: { type: "order", id: orderId },
    before: entry.before,
    after: entry.after,
  });
}
