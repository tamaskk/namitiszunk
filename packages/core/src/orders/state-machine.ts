import type { OrderStatus } from "@namitiszunk/db";

export const orderEvents = [
  "payment_succeeded",
  "payment_timeout",
  "start_preparing",
  "reject",
  "mark_ready",
  "pick_up",
  "expire",
  "refund",
] as const;
export type OrderEvent = (typeof orderEvents)[number];

/** Who triggers an event: a venue staff role, the system (webhooks, Inngest jobs) or the guest. */
export type TriggerRole =
  "owner" | "manager" | "bartender" | "vip_host" | "system" | "guest";

export type TransitionContext = {
  role: TriggerRole;
  isVip: boolean;
  /** acceptedAt is set: auto-accepted at payment, or accepted by the bar. */
  accepted: boolean;
  /** Venue setting orderRules.refundOnExpiry. */
  refundOnExpiry: boolean;
};

type Rule = {
  from: OrderStatus;
  event: OrderEvent;
  to: OrderStatus;
  by: readonly TriggerRole[];
  when?: (ctx: TransitionContext) => boolean;
};

// The only transition table (docs/fejlesztesi-terv.md #21). Partial refunds keep the status.
export const transitionTable: readonly Rule[] = [
  {
    from: "awaiting_payment",
    event: "payment_succeeded",
    to: "new",
    by: ["system"],
  },
  {
    from: "awaiting_payment",
    event: "payment_timeout",
    to: "cancelled",
    by: ["system"],
  },
  { from: "new", event: "start_preparing", to: "preparing", by: ["bartender"] },
  { from: "new", event: "reject", to: "rejected", by: ["bartender"] },
  // Guests may cancel only at a manual-acceptance venue, before the bar accepted.
  {
    from: "new",
    event: "reject",
    to: "rejected",
    by: ["guest"],
    when: (ctx) => !ctx.accepted,
  },
  { from: "preparing", event: "mark_ready", to: "ready", by: ["bartender"] },
  // VIP orders are made at the bar but handed over by the VIP host.
  {
    from: "ready",
    event: "pick_up",
    to: "picked_up",
    by: ["bartender"],
    when: (ctx) => !ctx.isVip,
  },
  {
    from: "ready",
    event: "pick_up",
    to: "picked_up",
    by: ["vip_host", "manager"],
    when: (ctx) => ctx.isVip,
  },
  { from: "ready", event: "expire", to: "expired", by: ["system"] },
  {
    from: "expired",
    event: "refund",
    to: "refunded",
    by: ["system"],
    when: (ctx) => ctx.refundOnExpiry,
  },
  {
    from: "expired",
    event: "refund",
    to: "refunded",
    by: ["manager", "owner"],
  },
  {
    from: "picked_up",
    event: "refund",
    to: "refunded",
    by: ["manager", "owner"],
  },
];

export class InvalidTransition extends Error {
  override name = "InvalidTransition";

  constructor(
    readonly from: OrderStatus,
    readonly event: OrderEvent,
    readonly role: TriggerRole,
  ) {
    super(`${role} cannot ${event} an order in status ${from}`);
  }
}

/** Pure: the status after `event`, or InvalidTransition. */
export function next(
  state: OrderStatus,
  event: OrderEvent,
  ctx: TransitionContext,
): OrderStatus {
  const rule = transitionTable.find(
    (r) =>
      r.from === state &&
      r.event === event &&
      r.by.includes(ctx.role) &&
      (r.when?.(ctx) ?? true),
  );
  if (!rule) throw new InvalidTransition(state, event, ctx.role);
  return rule.to;
}
