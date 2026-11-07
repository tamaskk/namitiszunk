import { orderStatuses, type OrderStatus } from "@namitiszunk/db";
import { describe, expect, it, vi } from "vitest";

import {
  actionFor,
  type ActorKind,
  InvalidTransition,
  next,
  orderEvents,
  type OrderEvent,
  type TransitionContext,
  transitionTable,
} from "./state-machine";

// @namitiszunk/db (for orderStatuses) is server-only.
vi.mock("server-only", () => ({}));

const kinds: ActorKind[] = ["staff", "system", "guest"];

// Written out by hand from docs/fejlesztesi-terv.md #21, independent of the table under test.
const allowed: Partial<
  Record<`${OrderStatus}:${OrderEvent}`, [OrderStatus, ActorKind]>
> = {
  "awaiting_payment:payment_succeeded": ["new", "system"],
  "awaiting_payment:payment_timeout": ["cancelled", "system"],
  "new:start_preparing": ["preparing", "staff"],
  "new:reject": ["rejected", "staff"],
  "preparing:mark_ready": ["ready", "staff"],
  "ready:pick_up": ["picked_up", "staff"],
  "ready:expire": ["expired", "system"],
  "expired:refund": ["refunded", "staff"],
  "picked_up:refund": ["refunded", "staff"],
};

const ctx = (
  actorKind: ActorKind,
  over: Partial<TransitionContext> = {},
): TransitionContext => ({
  actorKind,
  accepted: true,
  refundOnExpiry: false,
  ...over,
});

describe("next", () => {
  const cases = orderStatuses.flatMap((state) =>
    orderEvents.map((event) => [state, event] as const),
  );

  it.each(cases)("%s + %s follows the transition table", (state, event) => {
    const expected = allowed[`${state}:${event}`];

    if (expected) {
      expect(next(state, event, ctx(expected[1]))).toBe(expected[0]);
    } else {
      for (const kind of kinds) {
        const loose = { accepted: false, refundOnExpiry: true };
        expect(() => next(state, event, ctx(kind, loose))).toThrow(
          InvalidTransition,
        );
        expect(() => next(state, event, ctx(kind))).toThrow(InvalidTransition);
      }
    }
  });

  it("rejects a transition from Ready back to New", () => {
    const act = () => next("ready", "start_preparing", ctx("staff"));

    expect(act).toThrow(/staff cannot start_preparing .* ready/);
  });

  it.each([
    ["awaiting_payment", "payment_succeeded"],
    ["awaiting_payment", "payment_timeout"],
    ["ready", "expire"],
  ] as const)("lets only the system %s + %s", (state, event) => {
    expect(() => next(state, event, ctx("staff"))).toThrow(InvalidTransition);
    expect(() => next(state, event, ctx("guest"))).toThrow(InvalidTransition);
  });

  it("gives every rule an actor-kind guard, so the table fails closed", () => {
    const loose = { accepted: false, refundOnExpiry: true };

    const unguarded = transitionTable.filter((rule) =>
      kinds.every((kind) => rule.when(ctx(kind, loose))),
    );

    expect(unguarded).toEqual([]);
  });

  it.each([
    ["new", "start_preparing"],
    ["preparing", "mark_ready"],
    ["ready", "pick_up"],
    ["new", "reject"],
    ["picked_up", "refund"],
  ] as const)("keeps guests and the system from %s + %s", (state, event) => {
    const loose = { accepted: true, refundOnExpiry: true };

    expect(() => next(state, event, ctx("guest", loose))).toThrow(
      InvalidTransition,
    );
    expect(() => next(state, event, ctx("system", loose))).toThrow(
      InvalidTransition,
    );
  });

  it("lets a guest cancel only before acceptance", () => {
    expect(next("new", "reject", ctx("guest", { accepted: false }))).toBe(
      "rejected",
    );
    expect(() => next("new", "reject", ctx("guest"))).toThrow(
      InvalidTransition,
    );
    expect(() =>
      next("new", "reject", ctx("system", { accepted: false })),
    ).toThrow(InvalidTransition);
  });

  it("auto-refunds an expired order only when the venue enabled it", () => {
    expect(
      next("expired", "refund", ctx("system", { refundOnExpiry: true })),
    ).toBe("refunded");
    expect(() => next("expired", "refund", ctx("system"))).toThrow(
      InvalidTransition,
    );
    expect(() =>
      next("picked_up", "refund", ctx("system", { refundOnExpiry: true })),
    ).toThrow(InvalidTransition);
    expect(() => next("expired", "refund", ctx("guest"))).toThrow(
      InvalidTransition,
    );
  });
});

describe("actionFor", () => {
  it("maps a VIP pick-up to the hand-over permission", () => {
    expect(actionFor("pick_up", { isVip: true })).toBe("order.handOverVip");
    expect(actionFor("pick_up", { isVip: false })).toBe("order.pick_up");
    expect(actionFor("pick_up", {})).toBe("order.pick_up");
    expect(actionFor("mark_ready", { isVip: true })).toBe("order.mark_ready");
  });
});
