import "server-only";

import {
  Order,
  type OrderStatus,
  Venue,
  type venueRoles,
} from "@namitiszunk/db";

import { audit, type AuditActor } from "../audit/audit";
import {
  actionFor,
  InvalidTransition,
  next,
  type OrderAction,
  type OrderEvent,
} from "./state-machine";

type Id = AuditActor["id"] & {};

export type OrderActor =
  | {
      kind: "staff";
      role: (typeof venueRoles)[number];
      /** The active PIN holder's VenueMember id. */
      memberId: Id;
      name: string;
    }
  | { kind: "system"; name: string }
  | { kind: "guest"; userId?: Id };

/** Throws when the actor may not perform `action` at the venue. The only role check. */
export type Authorize = (
  actor: OrderActor,
  action: OrderAction,
  venueId: Id,
) => Promise<void> | void;

export type StatusChanged = {
  orderId: Id;
  venueId: Id;
  barId: Id;
  event: OrderEvent;
  from: OrderStatus;
  to: OrderStatus;
  actor: OrderActor;
};

export type TransitionOptions = {
  // shortcut: injected because RBAC is built in parallel, wire to requirePermission (T-023) once merged.
  authorize: Authorize;
  /** Required when staff rejects an order. */
  reason?: string;
  // shortcut: a plain hook instead of the SDKs, wire Ably publish (T-031) then Inngest `order/status.changed` (T-035) once merged.
  /** Runs only after the commit; its errors reach the caller although the status already changed. */
  afterCommit?: (change: StatusChanged) => Promise<void> | void;
  now?: Date;
};

function auditActorOf(actor: OrderActor): AuditActor {
  if (actor.kind === "staff") {
    return { type: "venue_member", id: actor.memberId, name: actor.name };
  }
  if (actor.kind === "system") return { type: "system", name: actor.name };
  return { type: "user", id: actor.userId, name: "guest" };
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
  actor: OrderActor,
  options: TransitionOptions,
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
      await options.authorize(actor, actionFor(event, order), order.venueId);

      const venue = await Venue.findById(order.venueId)
        .select("orderRules")
        .session(session)
        .lean();
      if (!venue) throw new Error(`venue ${String(order.venueId)} not found`);
      const from = order.status;
      const to = next(from, event, {
        actorKind: actor.kind,
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
      if (event === "reject" && actor.kind === "staff") {
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
      if (!updated) throw new InvalidTransition(from, event, actor.kind);

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
