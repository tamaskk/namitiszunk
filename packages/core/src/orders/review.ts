import "server-only";

import { Order, Review } from "@namitiszunk/db";

import type { Actor } from "../auth/permissions";
import { ConflictError, NotFoundError } from "../errors";
import { getGuestOrder, type GuestOrderView } from "./guest-order";

type GuestActor = Extract<Actor, { kind: "guest" }>;

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/** The thanks page (T-045): the order, and whether the guest already rated it. */
export async function getGuestThanks(
  actor: GuestActor,
  orderId: string,
): Promise<{ order: GuestOrderView; reviewed: boolean }> {
  const order = await getGuestOrder(actor, orderId);
  const reviewed = (await Review.exists({ orderId: order.id })) !== null;
  return { order, reviewed };
}

/**
 * The guest's 1–5 star rating of a picked-up order (T-045), once per order. The unique index on
 * Review.orderId decides a race between two submits: the second gets 409.
 */
export async function submitReview(
  actor: GuestActor,
  orderId: string,
  input: { stars: number; text?: string },
): Promise<void> {
  const order = await Order.findById(orderId)
    .select("venueId status +guestTokenHash")
    .lean();
  if (!order || actor.guestId === "" || order.guestTokenHash !== actor.guestId)
    throw new NotFoundError();
  if (order.status !== "picked_up") throw new ConflictError("not_picked_up");
  try {
    await Review.create({
      venueId: order.venueId,
      orderId: order._id,
      stars: input.stars,
      ...(input.text ? { text: input.text } : {}),
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new ConflictError("already_reviewed");
    throw error;
  }
}
