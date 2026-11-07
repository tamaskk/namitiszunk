import "server-only";

import type { StatusChanged } from "@namitiszunk/core/orders";
import * as Sentry from "@sentry/nextjs";
import { eventType, Inngest, staticSchema } from "inngest";

export const inngest = new Inngest({ id: "namitiszunk" });

/** Sent by order creation (T-040 / T-033) once the order and its PaymentIntent exist. */
export const orderCreated = eventType("order/created", {
  schema: staticSchema<{ orderId: string; venueId: string }>(),
});

export const orderStatusChanged = eventType("order/status.changed", {
  schema: staticSchema<{
    orderId: string;
    venueId: string;
    event: StatusChanged["event"];
    from: StatusChanged["from"];
    to: StatusChanged["to"];
  }>(),
});

// Each event happens at most once per order (the state machine has no cycles), so the id dedupes retries.
export function statusChangedEvent(change: StatusChanged) {
  const orderId = String(change.orderId);
  return orderStatusChanged.create(
    {
      orderId,
      venueId: String(change.venueId),
      event: change.event,
      from: change.from,
      to: change.to,
    },
    { id: `order-${orderId}-${change.event}` },
  );
}

export function orderCreatedEvent(orderId: string, venueId: string) {
  return orderCreated.create(
    { orderId, venueId },
    { id: `order-${orderId}-created` },
  );
}

/**
 * The transition() hook: the status is already committed, so a failed send cannot be undone by the caller.
 * It goes to Sentry instead of failing the request; a lost event means a missed timer, found by the alert.
 */
export async function publishStatusChanged(change: StatusChanged) {
  try {
    await inngest.send(statusChangedEvent(change));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { inngest_event: orderStatusChanged.name },
      extra: { orderId: String(change.orderId), event: change.event },
    });
  }
}

/** onFailure handler shared by every function: a run that exhausted its retries reaches Sentry once. */
export function reportFailure({
  error,
  event,
}: {
  error: Error;
  event: { data: { function_id: string; run_id: string } };
}) {
  Sentry.captureException(error, {
    tags: { inngest_function: event.data.function_id },
    extra: { runId: event.data.run_id },
  });
}
