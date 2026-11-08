import "server-only";

import {
  Bar,
  Order,
  Payment,
  Refund,
  type Types,
  Venue,
} from "@namitiszunk/db";
import type { OrderResponse } from "@namitiszunk/validators";

import type { Actor } from "../auth/permissions";
import { ConflictError, NotFoundError } from "../errors";
import { formatShortNumber } from "./short-number";
import { type StatusChanged, transition } from "./transition";

type GuestActor = Extract<Actor, { kind: "guest" }>;

/** What the order status page (T-043) and the app (T-088) show a guest; the schema lives in validators. */
export type GuestOrderView = OrderResponse;

async function loadOwnOrder(actor: GuestActor, orderId: string) {
  const order = await Order.findById(orderId)
    .select(
      "venueId businessDate shortNumber status updatedAt items totalHuf barId isVip acceptedAt rejectionReason +guestTokenHash",
    )
    .lean();
  // Not the guest's order and no order at all look the same: 404.
  if (!order || actor.guestId === "" || order.guestTokenHash !== actor.guestId)
    throw new NotFoundError();
  return order;
}

/**
 * Each guest refund leaves the Stripe fee with the venue, so a card may cancel once per venue per business day.
 * shortcut: Apple Pay and Google Pay give a card another fingerprint, so card + wallet allows one extra cancel.
 */
const GUEST_CANCELS_PER_DAY = 1;

async function cancelLimitReached(order: {
  _id: Types.ObjectId;
  businessDate: string;
}): Promise<boolean> {
  const payment = await Payment.findOne({ orderId: order._id })
    .select("+cardFingerprint")
    .lean();
  // Fail open: without a fingerprint (card details not stored yet, or Stripe failed) the guest may cancel.
  if (!payment?.cardFingerprint) return false;
  const sameCard = await Payment.find({
    venueId: payment.venueId,
    cardFingerprint: payment.cardFingerprint,
  })
    .select("orderId")
    .lean();
  const cancels = await Order.countDocuments({
    _id: { $in: sameCard.map((p) => p.orderId) },
    businessDate: order.businessDate,
    cancelledByGuest: true,
  });
  return cancels >= GUEST_CANCELS_PER_DAY;
}

export async function getGuestOrder(
  actor: GuestActor,
  orderId: string,
): Promise<GuestOrderView> {
  const order = await loadOwnOrder(actor, orderId);
  const cancellable = order.status === "new" && order.acceptedAt == null;
  const [bar, refunds, limitReached] = await Promise.all([
    Bar.findById(order.barId).select("name").lean(),
    Refund.find({ orderId: order._id, status: "succeeded" })
      .select("amountHuf")
      .lean(),
    cancellable ? cancelLimitReached(order) : false,
  ]);
  return {
    id: String(order._id),
    number: formatShortNumber(order.shortNumber),
    status: order.status,
    version: order.updatedAt.getTime(),
    items: order.items.map((item) => ({
      name: item.name,
      ...(item.nameEn ? { nameEn: item.nameEn } : {}),
      quantity: item.quantity,
      lineTotalHuf: item.lineTotalHuf,
    })),
    totalHuf: order.totalHuf,
    barName: bar?.name ?? "",
    isVip: order.isVip ?? false,
    canCancel: cancellable && !limitReached,
    ...(limitReached ? { cancelLimitReached: true } : {}),
    ...(order.rejectionReason
      ? { rejectionReason: order.rejectionReason }
      : {}),
    refundedHuf: refunds.reduce((sum, r) => sum + r.amountHuf, 0),
  };
}

/** The guest's cancel before acceptance; the reject hook refunds the full amount (T-034). */
/** Where "Rendelj még" and "Vissza a menübe" lead: the same venue's menu at the same bar and zone. */
export type MenuLink = { venueSlug: string; barId: string; zoneId?: string };

/** The menu link of an order the caller already loaded as theirs. */
export async function menuLinkOf(orderId: string): Promise<MenuLink> {
  const placed = await Order.findById(orderId)
    .select("venueId barId zoneId")
    .lean();
  const venue = placed
    ? await Venue.findById(placed.venueId).select("slug").lean()
    : null;
  if (!placed || !venue) throw new NotFoundError();
  return {
    venueSlug: venue.slug,
    barId: String(placed.barId),
    ...(placed.zoneId ? { zoneId: String(placed.zoneId) } : {}),
  };
}

/** The live page (T-043, T-048): the order and, for an order that ended, the way back to the menu. */
export async function getGuestLiveOrder(
  actor: GuestActor,
  orderId: string,
): Promise<{ order: GuestOrderView; menu: MenuLink }> {
  const order = await getGuestOrder(actor, orderId);
  return { order, menu: await menuLinkOf(order.id) };
}

export async function cancelGuestOrder(
  actor: GuestActor,
  orderId: string,
): Promise<StatusChanged> {
  const order = await loadOwnOrder(actor, orderId);
  // shortcut: two cancels with the same card at the same moment can both pass; fine for a fee cap.
  if (await cancelLimitReached(order))
    throw new ConflictError("guest_cancel_limit");
  return transition(orderId, "reject", actor);
}
