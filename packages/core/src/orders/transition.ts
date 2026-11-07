import "server-only";

import { Order, type OrderStatus, Venue } from "@namitiszunk/db";

import { audit, type AuditActor } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import {
  type ActorKind,
  actionFor,
  InvalidTransition,
  next,
  type OrderAction,
  type OrderEvent,
} from "./state-machine";

type Id = AuditActor["id"] & {};

/** Throws when the actor may not perform `action` at the venue. The only role check. */
export type Authorize = (
  actor: Actor,
  action: OrderAction,
  venueId: string,
) => Promise<void> | void;

// shortcut: the resource carries only the venue, so a guest's own-order reject and a manager refund under a set limit are denied; pass guestId / amountHuf once guest sessions (T-030) and refunds land.
const authorizeByRole: Authorize = (actor, action, venueId) =>
  requirePermission(actor, action, { venueId });

export type StatusChanged = {
  orderId: Id;
  venueId: Id;
  barId: Id;
  event: OrderEvent;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
};

export type TransitionOptions = {
  /** Defaults to the RBAC matrix (T-023); tests inject their own. */
  authorize?: Authorize;
  /** Required when staff rejects an order. */
  reason?: string;
  // shortcut: a plain hook instead of the SDKs, wire Ably publish (T-031) then Inngest `order/status.changed` (T-035) once merged.
  /** Runs only after the commit; its errors reach the caller although the status already changed. */
  afterCommit?: (change: StatusChanged) => Promise<void> | void;
  now?: Date;
};

// A signed-in user acting on an order (owner from admin, platform support) is staff for the state machine.
function actorKindOf(actor: Actor): ActorKind {
  return actor.kind === "user" ? "staff" : actor.kind;
}

function auditActorOf(actor: Actor): AuditActor {
  switch (actor.kind) {
    case "staff":
      return { type: "venue_member", id: actor.memberId };
    case "user":
      return { type: "user", id: actor.userId };
    case "system":
      return { type: "system", name: actor.source };
    case "guest":
      // The guest session id is not a User id, so it stays out of the ObjectId field.
      return { type: "user", name: "guest" };
  }
}

/**
 * The only place an order's status changes. Two parallel calls for the same order give
 * one success; the other sees the new status and throws InvalidTransition.
 * A duplicate payment webhook therefore throws InvalidTransition with from !== "awaiting_payment":
 * callers treat that as already processed.
 */
export async function transition(
  orderId: Id,
  event: OrderEvent,
  actor: Actor,
  options: TransitionOptions = {},
): Promise<StatusChanged> {
  const now = options.now ?? new Date();
  const session = await Order.startSession();
  let change: StatusChanged | undefined;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId)
        .select("venueId barId status isVip acceptedAt")
        .session(session)
        .lean();
      if (!order) throw new Error(`order ${String(orderId)} not found`);
      await (options.authorize ?? authorizeByRole)(
        actor,
        actionFor(event, order),
        String(order.venueId),
      );

      const venue = await Venue.findById(order.venueId)
        .select("orderRules")
        .session(session)
        .lean();
      if (!venue) throw new Error(`venue ${String(order.venueId)} not found`);
      const from = order.status;
      const to = next(from, event, {
        actorKind: actorKindOf(actor),
        accepted: order.acceptedAt != null,
        refundOnExpiry: venue.orderRules?.refundOnExpiry ?? false,
      });

      const set: Record<string, unknown> = { status: to };
      if (event === "payment_succeeded") {
        set.paidAt = now;
        if (venue.orderRules?.autoAccept ?? true) set.acceptedAt = now;
      }
      // At a manual-acceptance venue, starting the order is the acceptance.
      if (event === "start_preparing" && !order.acceptedAt) {
        set.acceptedAt = now;
      }
      if (event === "mark_ready") set.readyAt = now;
      if (event === "pick_up") set.pickedUpAt = now;
      if (event === "reject" && actorKindOf(actor) === "staff") {
        if (!options.reason?.trim()) {
          throw new Error("a staff rejection needs a reason");
        }
        set.rejectionReason = options.reason.trim();
      }

      // Conditional on the status we read, so a concurrent change cannot be overwritten.
      const updated = await Order.findOneAndUpdate(
        { _id: orderId, status: from },
        { $set: set },
        { session },
      );
      if (!updated)
        throw new InvalidTransition(from, event, actorKindOf(actor));

      await audit(session, {
        actor: auditActorOf(actor),
        venueId: order.venueId,
        action: `order.${event}`,
        target: { type: "order", id: order._id },
        before: { status: from },
        after: set,
      });
      change = {
        orderId: order._id,
        venueId: order.venueId,
        barId: order.barId,
        event,
        from,
        to,
        actor,
      };
    });
  } finally {
    await session.endSession();
  }
  if (!change) throw new Error("transaction finished without a change");
  await options.afterCommit?.(change);
  return change;
}
