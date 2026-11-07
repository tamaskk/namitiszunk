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

/** Only the kind of actor: which roles may act is the RBAC matrix's job (T-023). */
export type ActorKind = "staff" | "system" | "guest";

export type TransitionContext = {
  actorKind: ActorKind;
  /** acceptedAt is set: auto-accepted at payment, or accepted by the bar. */
  accepted: boolean;
  /** Venue setting orderRules.refundOnExpiry. */
  refundOnExpiry: boolean;
};

type Rule = {
  from: OrderStatus;
  event: OrderEvent;
  to: OrderStatus;
  when?: (ctx: TransitionContext) => boolean;
};

const bySystem = (ctx: TransitionContext) => ctx.actorKind === "system";
const byStaff = (ctx: TransitionContext) => ctx.actorKind === "staff";

// The only transition table (docs/fejlesztesi-terv.md #21). Partial refunds keep the status.
export const transitionTable: readonly Rule[] = [
  {
    from: "awaiting_payment",
    event: "payment_succeeded",
    to: "new",
    when: bySystem,
  },
  {
    from: "awaiting_payment",
    event: "payment_timeout",
    to: "cancelled",
    when: bySystem,
  },
  { from: "new", event: "start_preparing", to: "preparing" },
  // Guests may cancel only before acceptance, so only at a manual-acceptance venue.
  {
    from: "new",
    event: "reject",
    to: "rejected",
    when: (ctx) => byStaff(ctx) || (ctx.actorKind === "guest" && !ctx.accepted),
  },
  { from: "preparing", event: "mark_ready", to: "ready" },
  { from: "ready", event: "pick_up", to: "picked_up" },
  { from: "ready", event: "expire", to: "expired", when: bySystem },
  // The automatic refund only when the venue enabled it; staff may always refund in full.
  {
    from: "expired",
    event: "refund",
    to: "refunded",
    when: (ctx) => byStaff(ctx) || (bySystem(ctx) && ctx.refundOnExpiry),
  },
  { from: "picked_up", event: "refund", to: "refunded", when: byStaff },
];

export class InvalidTransition extends Error {
  override name = "InvalidTransition";

  constructor(
    readonly from: OrderStatus,
    readonly event: OrderEvent,
    readonly actorKind: ActorKind,
  ) {
    super(`${actorKind} cannot ${event} an order in status ${from}`);
  }
}

/** Pure: the status after `event`, or InvalidTransition. */
export function next(
  state: OrderStatus,
  event: OrderEvent,
  ctx: TransitionContext,
): OrderStatus {
  const rule = transitionTable.find(
    (r) => r.from === state && r.event === event && (r.when?.(ctx) ?? true),
  );
  if (!rule) throw new InvalidTransition(state, event, ctx.actorKind);
  return rule.to;
}
