import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { NotFoundError } from "@namitiszunk/core/errors";
import { Order } from "@namitiszunk/db";

import { isObjectId, type RequestActor } from "./actors";

type GuestActor = Extract<RequestActor, { kind: "guest" }>;

const tokenPattern = /^[A-Za-z0-9_-]{22}$/;

/** Whether the value has the shape of a guest token, before any lookup. */
export const isGuestTokenFormat = (token: string): boolean =>
  tokenPattern.test(token);

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A new 128-bit guest token for an order. Store only `hash` (Order.guestTokenHash); give `token`
 * to the guest once, in the URL `/o/[orderId]?t=[token]`.
 */
export function createGuestToken(): { token: string; hash: string } {
  const token = randomBytes(16).toString("base64url");
  return { token, hash: hashGuestToken(token) };
}

/** Constant-time check of a token against a stored hash. */
export function guestTokenMatches(
  token: string | null | undefined,
  storedHash: string,
): boolean {
  if (!token || !tokenPattern.test(token)) return false;
  const given = Buffer.from(hashGuestToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/**
 * The guest of one order, proven by its token. A missing order, a missing token and a wrong
 * token all throw the same 404, so the response never tells whether the order exists.
 * `guestId` is the token hash (Order.guestTokenHash): the token grants this one order and nothing else.
 */
export async function guestActorFromToken(
  orderId: string,
  token: string | null | undefined,
): Promise<GuestActor> {
  if (!isObjectId(orderId) || !token) throw new NotFoundError();
  const order = await Order.findById(orderId).select("+guestTokenHash").lean();
  if (!order || !guestTokenMatches(token, order.guestTokenHash))
    throw new NotFoundError();
  // Core's own-order check compares guestId with Order.guestTokenHash.
  return {
    kind: "guest",
    id: `guest:${orderId}`,
    guestId: order.guestTokenHash,
  };
}
