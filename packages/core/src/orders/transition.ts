import "server-only";

import { Order, type OrderStatus, Venue } from "@namitiszunk/db";

import { audit, type AuditActor, auditActorOf } from "../audit/audit";
import {
  type Actor,
  requirePermission,
  type Resource,
} from "../auth/permissions";
import { AppError, NotFoundError } from "../errors";
import { publishStatusChange } from "../realtime";
import { reportError } from "../report-error";
import {
  type ActorKind,
  actionFor,
  InvalidTransition,
  next,
  type OrderAction,
  type OrderEvent,
} from "./state-machine";

type Id = AuditActor["id"] & {};

/** Throws when the actor may not perform `action` on the resource. The only role check. */
type Authorize = (
  actor: Actor,
  action: OrderAction,
  resource: Resource,
) => Promise<void> | void;

export type StatusChanged = {
  orderId: Id;
  venueId: Id;
  barId: Id;
  isVip: boolean;
  event: OrderEvent;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  /** Order.updatedAt in epoch ms after the change; the realtime message carries it so clients drop stale ones. */
  version: number;
};

export type StatusChangedHook = (change: StatusChanged) => Promise<void> | void;

export type TransitionOptions = {
  /** Required when staff rejects an order. */
  reason?: string;
  /** Gets each failed post-commit hook (Ably publish, onStatusChanged hooks) once; defaults to setDefaultErrorReporter's. */
  reportError?: (error: unknown) => void;
  now?: Date;
};

// On globalThis because Next.js bundles instrumentation.ts (where apps register) apart from route handlers.
const registry = globalThis as {
  __statusChangedHooks?: Set<StatusChangedHook>;
};
const statusChangedHooks = (registry.__statusChangedHooks ??= new Set());

/**
 * Registers a hook that runs after every committed transition in this process, next to the Ably publish.
 * Every app process that calls transition() must register its hooks (apps/api does in instrumentation.ts).
 * All hooks run even when one fails; each failure goes to `reportError` once and never reaches the caller.
 * Returns an unregister function.
 */
export function onStatusChanged(hook: StatusChangedHook): () => void {
  statusChangedHooks.add(hook);
  return () => statusChangedHooks.delete(hook);
}

// A signed-in user acting on an order (owner from admin, platform support) is staff for the state machine.
function actorKindOf(actor: Actor): ActorKind {
  return actor.kind === "user" ? "staff" : actor.kind;
}

/** Whether the actor may learn that the order exists; otherwise it gets 404, not 403. */
function canSee(
  actor: Actor,
  order: { venueId: string; guestId: string },
): boolean {
  switch (actor.kind) {
    case "system":
      return true;
    case "staff":
      return actor.venueId === order.venueId;
    case "user":
      return (
        actor.platformRole !== undefined ||
        actor.memberships.some((m) => m.venueId === order.venueId)
      );
    case "guest":
      return actor.guestId !== "" && actor.guestId === order.guestId;
  }
}

/**
 * The only place an order's status changes; the RBAC matrix (T-023) decides who may act.
 * Two parallel calls for the same order give one success; the other sees the new status
 * and throws InvalidTransition. A duplicate payment webhook therefore throws InvalidTransition
 * with from !== "awaiting_payment": callers treat that as already processed.
 *
 * A guest actor's guestId is the hash of the order's guest token (Order.guestTokenHash).
 */
export function transition(
  orderId: Id,
  event: OrderEvent,
  actor: Actor,
  options: TransitionOptions = {},
): Promise<StatusChanged> {
  return transitionWith(requirePermission, orderId, event, actor, options);
}

/** Test seam only: not re-exported from ./index, so no caller outside this package can skip RBAC. */
export async function transitionWith(
  authorize: Authorize,
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
        .select("venueId barId status isVip acceptedAt +guestTokenHash")
        .session(session)
        .lean();
      const venueId = String(order?.venueId);
      const guestId = order?.guestTokenHash ?? "";
      if (!order || !canSee(actor, { venueId, guestId })) {
        throw new NotFoundError();
      }
      // shortcut: the venue has no manager refund limit field yet, so it stays undefined and a manager refund through transition() is denied; T-034 passes amountHuf and the limit.
      await authorize(actor, actionFor(event, order), { venueId, guestId });

      const venue = await Venue.findById(order.venueId)
        .select("orderRules")
        .session(session)
        .lean();
      if (!venue) throw new Error(`venue ${venueId} not found`);
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
          throw new AppError(400, "reason_required");
        }
        set.rejectionReason = options.reason.trim();
      }

      // Conditional on the status we read, so a concurrent change cannot be overwritten.
      const updated = await Order.findOneAndUpdate(
        { _id: orderId, status: from },
        { $set: set },
        { session, returnDocument: "after" },
      ).lean();
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
        isVip: order.isVip ?? false,
        event,
        from,
        to,
        actor,
        version: updated.updatedAt.getTime(),
      };
    });
  } finally {
    await session.endSession();
  }
  if (!change) throw new Error("transaction finished without a change");
  // The database is the source of truth: a failed hook never undoes or fails the committed change.
  const committed = change;
  const results = await Promise.allSettled(
    [publishStatusChange, ...statusChangedHooks].map(async (hook) =>
      hook(committed),
    ),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      (options.reportError ?? reportError)(result.reason);
    }
  }
  return change;
}
