import "server-only";

import { Bar, Order, Refund } from "@namitiszunk/db";
import type { OrderResponse } from "@namitiszunk/validators";

import type { Actor } from "../auth/permissions";
import { NotFoundError } from "../errors";
import { formatShortNumber } from "./short-number";
import { type StatusChanged, transition } from "./transition";

type GuestActor = Extract<Actor, { kind: "guest" }>;

/** What the order status page (T-043) and the app (T-088) show a guest; the schema lives in validators. */
export type GuestOrderView = OrderResponse;

async function loadOwnOrder(actor: GuestActor, orderId: string) {
  const order = await Order.findById(orderId)
    .select(
      "shortNumber status updatedAt items totalHuf barId isVip acceptedAt rejectionReason +guestTokenHash",
    )
    .lean();
  // Not the guest's order and no order at all look the same: 404.
  if (!order || actor.guestId === "" || order.guestTokenHash !== actor.guestId)
    throw new NotFoundError();
  return order;
}

export async function getGuestOrder(
  actor: GuestActor,
  orderId: string,
): Promise<GuestOrderView> {
  const order = await loadOwnOrder(actor, orderId);
  const [bar, refunds] = await Promise.all([
    Bar.findById(order.barId).select("name").lean(),
    Refund.find({ orderId: order._id, status: "succeeded" })
      .select("amountHuf")
      .lean(),
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
    canCancel: order.status === "new" && order.acceptedAt == null,
    ...(order.rejectionReason
      ? { rejectionReason: order.rejectionReason }
      : {}),
    refundedHuf: refunds.reduce((sum, r) => sum + r.amountHuf, 0),
  };
}

/** The guest's cancel before acceptance; the reject hook refunds the full amount (T-034). */
export function cancelGuestOrder(
  actor: GuestActor,
  orderId: string,
): Promise<StatusChanged> {
  return transition(orderId, "reject", actor);
}
