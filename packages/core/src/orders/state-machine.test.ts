import { orderStatuses, type OrderStatus } from "@namitiszunk/db";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidTransition,
  next,
  orderEvents,
  type OrderEvent,
  type TransitionContext,
  type TriggerRole,
} from "./state-machine";

// @namitiszunk/db (for orderStatuses) is server-only.
vi.mock("server-only", () => ({}));

const roles: TriggerRole[] = [
  "owner",
  "manager",
  "bartender",
  "vip_host",
  "system",
  "guest",
];

// Written out by hand from docs/fejlesztesi-terv.md #21, independent of the table under test.
const allowed: Partial<
  Record<`${OrderStatus}:${OrderEvent}`, [OrderStatus, TriggerRole]>
> = {
  "awaiting_payment:payment_succeeded": ["new", "system"],
  "awaiting_payment:payment_timeout": ["cancelled", "system"],
  "new:start_preparing": ["preparing", "bartender"],
  "new:reject": ["rejected", "bartender"],
  "preparing:mark_ready": ["ready", "bartender"],
  "ready:pick_up": ["picked_up", "bartender"],
  "ready:expire": ["expired", "system"],
  "expired:refund": ["refunded", "manager"],
  "picked_up:refund": ["refunded", "owner"],
};

const ctx = (
  role: TriggerRole,
  over: Partial<TransitionContext> = {},
): TransitionContext => ({
  role,
  isVip: false,
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
      for (const role of roles) {
        const all = { isVip: true, accepted: false, refundOnExpiry: true };
        expect(() => next(state, event, ctx(role, all))).toThrow(
          InvalidTransition,
        );
        expect(() => next(state, event, ctx(role))).toThrow(InvalidTransition);
      }
    }
  });

  it("rejects a transition from Ready back to New", () => {
    const act = () => next("ready", "start_preparing", ctx("bartender"));

    expect(act).toThrow(/bartender cannot start_preparing .* ready/);
  });

  it("lets only a VIP host or manager hand over a VIP order", () => {
    const vip = { isVip: true };

    expect(next("ready", "pick_up", ctx("vip_host", vip))).toBe("picked_up");
    expect(next("ready", "pick_up", ctx("manager", vip))).toBe("picked_up");
    expect(() => next("ready", "pick_up", ctx("bartender", vip))).toThrow(
      InvalidTransition,
    );
    expect(() => next("ready", "pick_up", ctx("vip_host"))).toThrow(
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
  });

  it("auto-refunds an expired order only when the venue enabled it", () => {
    expect(
      next("expired", "refund", ctx("system", { refundOnExpiry: true })),
    ).toBe("refunded");
    expect(() => next("expired", "refund", ctx("system"))).toThrow(
      InvalidTransition,
    );
    expect(() => next("picked_up", "refund", ctx("bartender"))).toThrow(
      InvalidTransition,
    );
  });

  it("keeps money and bar actions away from roles the plan does not name", () => {
    for (const role of ["guest", "vip_host", "owner", "manager"] as const) {
      expect(() => next("new", "start_preparing", ctx(role))).toThrow(
        InvalidTransition,
      );
    }
    expect(() =>
      next("awaiting_payment", "payment_succeeded", ctx("guest")),
    ).toThrow(InvalidTransition);
  });
});
