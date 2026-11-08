import type { OrderResponse } from "@namitiszunk/validators";

type Status = OrderResponse["status"];

export type StatusView = {
  /** Message key under order.status.views. */
  key: Status;
  /** The full-screen Ready signal. */
  ready: boolean;
  /** Keep the screen awake: the guest is still waiting for the bar. */
  wakeLock: boolean;
  /** Nothing will change any more: stop listening and forget the stored order. */
  final: boolean;
  tone: "neutral" | "success" | "danger";
};

const waiting = {
  ready: false,
  wakeLock: true,
  final: false,
  tone: "neutral",
} as const;
const ended = (tone: StatusView["tone"]) =>
  ({ ready: false, wakeLock: false, final: true, tone }) as const;

const views: Record<Status, Omit<StatusView, "key">> = {
  // Payment still processing: no wake lock yet, the webhook usually lands within seconds.
  awaiting_payment: { ...waiting, wakeLock: false },
  new: waiting,
  preparing: waiting,
  ready: { ready: true, wakeLock: true, final: false, tone: "success" },
  picked_up: ended("success"),
  rejected: ended("danger"),
  refunded: ended("danger"),
  expired: ended("danger"),
  cancelled: ended("neutral"),
};

export function statusView(status: Status): StatusView {
  return { key: status, ...views[status] };
}
