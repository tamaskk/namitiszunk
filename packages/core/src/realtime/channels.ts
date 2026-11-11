// Client-safe (type-only import): the bar view (T-054) and the order status page (T-043) subscribe to these.
import type { OrderStatus } from "@namitiszunk/db";

export const barChannel = (venueId: string, barId: string) =>
  `venue:${venueId}:bar:${barId}`;
export const vipChannel = (venueId: string) => `venue:${venueId}:vip`;
export const orderChannel = (orderId: string) => `order:${orderId}`;

/** The Ably message name of a status change. */
export const STATUS_EVENT = "status";

export type StatusMessage = {
  orderId: string;
  status: OrderStatus;
  /** Order.updatedAt in epoch ms after the change: grows with every write of the order. */
  version: number;
};

/**
 * Ably may deliver a message late or twice: apply it only when it is not older than what the client shows.
 * Equal versions apply, because two writes in the same millisecond share one.
 */
export function shouldApply(
  currentVersion: number | undefined,
  message: Pick<StatusMessage, "version">,
): boolean {
  return currentVersion === undefined || message.version >= currentVersion;
}

/**
 * The Ably message name of a change on a bar that is not a status change (T-054): receipt entered,
 * reminder sent, an order moved in or out. The bar view reloads its list when it gets one.
 */
export const BAR_UPDATE_EVENT = "update";

export type BarUpdateMessage = { orderId?: string };
