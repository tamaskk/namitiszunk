import { platformRoles, venueRoles } from "@namitiszunk/db";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../errors";
import {
  can,
  Forbidden,
  permissions,
  requirePermission,
  type Action,
  type Actor,
  type PlatformRole,
  type Resource,
  type Role,
  type VenueRole,
} from "./permissions";

// The test reads the role lists from @namitiszunk/db, which is server-only; permissions.ts itself is not.
vi.mock("server-only", () => ({}));

// The permission matrix from the product doc (rev 306), transcribed by hand so the test
// does not just restate the code table. "-" denied, "✓" allowed, otherwise a condition.
const roles = [
  "guest",
  "bartender",
  "manager",
  "owner",
  "vip_host",
  "support",
  "admin",
  "finance",
  "system",
] as const satisfies readonly Role[];

// prettier-ignore
const matrix: Record<Action, readonly string[]> = {
  //                       guest  bart  mgr        owner vip   supp  admin fin  system
  "order.create":          ["✓",  "-",  "-",       "-",  "-",  "-",  "-",  "-",  "-"],
  "order.pay":             ["-",  "-",  "-",       "-",  "-",  "-",  "-",  "-",  "✓"],
  "order.cancel":          ["-",  "-",  "-",       "-",  "-",  "-",  "-",  "-",  "✓"],
  "order.expire":          ["-",  "-",  "-",       "-",  "-",  "-",  "-",  "-",  "✓"],
  "order.start":           ["-",  "✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "order.ready":           ["-",  "✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "order.pickUp":          ["-",  "✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "order.reject":          ["own","✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "order.handOverVip":     ["-",  "-",  "✓",       "✓",  "✓",  "-",  "-",  "-",  "-"],
  "order.viewTakeOutList": ["-",  "-",  "✓",       "✓",  "✓",  "-",  "-",  "-",  "-"],
  "product.setSoldOut":    ["-",  "✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "bar.pauseOrders":       ["-",  "✓",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "order.refund":          ["-",  "-",  "limit",   "✓",  "-",  "✓",  "✓",  "-",  "-"],
  "menu.edit":             ["-",  "-",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "venue.manageBars":      ["-",  "-",  "✓",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "report.viewDaily":      ["-",  "-",  "✓",       "✓",  "-",  "✓",  "✓",  "✓",  "-"],
  "report.viewAll":        ["-",  "-",  "-",       "✓",  "-",  "✓",  "✓",  "✓",  "-"],
  "staff.invite":          ["-",  "-",  "pinRoles","✓",  "-",  "-",  "✓",  "-",  "-"],
  "payout.manage":         ["-",  "-",  "-",       "✓",  "-",  "-",  "-",  "-",  "-"],
  "venue.editSettings":    ["-",  "-",  "-",       "✓",  "-",  "-",  "✓",  "-",  "-"],
  "billing.view":          ["-",  "-",  "-",       "✓",  "-",  "-",  "✓",  "-",  "-"],
  "venue.create":          ["-",  "-",  "-",       "-",  "-",  "-",  "✓",  "-",  "-"],
  "venue.suspend":         ["-",  "-",  "-",       "-",  "-",  "-",  "✓",  "-",  "-"],
  "venue.impersonate":     ["-",  "-",  "-",       "-",  "-",  "✓",  "✓",  "-",  "-"],
  "plan.edit":             ["-",  "-",  "-",       "-",  "-",  "-",  "✓",  "-",  "-"],
  "platformReport.view":   ["-",  "-",  "-",       "-",  "-",  "-",  "✓",  "✓",  "-"],
};

const venueA = "venue-a";
const venueB = "venue-b";

const isVenueRole = (role: Role): role is VenueRole =>
  (venueRoles as readonly string[]).includes(role);

function actorFor(role: Role, venueId = venueA): Actor {
  if (role === "guest") return { kind: "guest", guestId: "guest-1" };
  if (role === "system") return { kind: "system", source: "stripe" };
  if (isVenueRole(role))
    return {
      kind: "user",
      userId: `user-${role}`,
      memberships: [{ venueId, memberId: `member-${role}`, role }],
    };
  return {
    kind: "user",
    userId: `user-${role}`,
    memberships: [],
    platformRole: role,
    confirmedWrite: true,
  };
}

// A resource that satisfies every condition, so a conditional cell reads as allowed.
const satisfyingResource: Resource = {
  venueId: venueA,
  guestId: "guest-1",
  amountHuf: 5000,
  targetRole: "bartender",
};

describe("permission matrix", () => {
  it("covers exactly the actions and roles in the code", () => {
    const codeRoles = [
      "guest",
      "system",
      ...venueRoles,
      ...platformRoles,
    ].sort();

    const fixtureActions = Object.keys(matrix).sort();

    expect(fixtureActions).toEqual(Object.keys(permissions).sort());
    expect([...roles].sort()).toEqual(codeRoles);
  });

  for (const [action, cells] of Object.entries(matrix) as [
    Action,
    readonly string[],
  ][]) {
    roles.forEach((role, i) => {
      const expected = cells[i] !== "-";
      it(`${role} ${expected ? "may" : "may not"} ${action}`, () => {
        const actor = actorFor(role);

        const allowed = can(actor, action, satisfyingResource);

        expect(allowed).toBe(expected);
      });
    });
  }
});

describe("venue isolation", () => {
  const venueActions = (Object.keys(permissions) as Action[]).filter(
    (action) => permissions[action].scope === "venue",
  );

  for (const role of venueRoles) {
    it(`${role} of one venue is forbidden every action on another venue`, () => {
      const actor = actorFor(role, venueA);
      const otherVenue = { ...satisfyingResource, venueId: venueB };

      const allowed = venueActions.filter((a) => can(actor, a, otherVenue));

      expect(allowed).toEqual([]);
      for (const a of venueActions)
        expect(() => requirePermission(actor, a, otherVenue)).toThrow(
          Forbidden,
        );
    });
  }

  it("takes the role from the membership of the resource's venue", () => {
    const actor: Actor = {
      kind: "user",
      userId: "u1",
      memberships: [
        { venueId: venueA, memberId: "m1", role: "owner" },
        { venueId: venueB, memberId: "m2", role: "bartender" },
      ],
    };

    expect(can(actor, "order.refund", { venueId: venueA })).toBe(true);
    expect(can(actor, "order.refund", { venueId: venueB })).toBe(false);
  });

  it("denies venue actions when the resource has no venue", () => {
    expect(can(actorFor("owner"), "menu.edit", {})).toBe(false);
  });

  it("denies a guest cancelling another guest's order", () => {
    const resource = { venueId: venueA, guestId: "guest-2" };

    expect(can(actorFor("guest"), "order.reject", resource)).toBe(false);
  });
});

describe("staff PIN session", () => {
  const pinBartender: Actor = {
    kind: "staff",
    venueId: venueA,
    memberId: "member-bartender",
    role: "bartender",
  };

  it("forbids a bartender on PIN to refund", () => {
    const resource = { venueId: venueA, amountHuf: 1000 };

    expect(() =>
      requirePermission(pinBartender, "order.refund", resource),
    ).toThrow(Forbidden);
  });

  it("acts with the PIN holder's role only in the tablet's venue", () => {
    expect(can(pinBartender, "order.start", { venueId: venueA })).toBe(true);
    expect(can(pinBartender, "order.start", { venueId: venueB })).toBe(false);
  });
});

describe("manager refund limit", () => {
  const manager = actorFor("manager");

  it("allows any amount when the venue sets no limit", () => {
    const resource = { venueId: venueA, amountHuf: 1_000_000 };

    expect(can(manager, "order.refund", resource)).toBe(true);
  });

  it("allows up to the limit and forbids above it", () => {
    const base = { venueId: venueA, managerRefundLimitHuf: 10_000 };

    expect(can(manager, "order.refund", { ...base, amountHuf: 10_000 })).toBe(
      true,
    );
    expect(can(manager, "order.refund", { ...base, amountHuf: 10_001 })).toBe(
      false,
    );
  });

  it("fails closed when a limit is set but the amount is missing or not an integer", () => {
    const base = { venueId: venueA, managerRefundLimitHuf: 10_000 };

    expect(can(manager, "order.refund", base)).toBe(false);
    expect(can(manager, "order.refund", { ...base, amountHuf: 99.5 })).toBe(
      false,
    );
  });

  it("does not limit the owner", () => {
    const owner = actorFor("owner");

    const resource = {
      venueId: venueA,
      managerRefundLimitHuf: 1,
      amountHuf: 50_000,
    };

    expect(can(owner, "order.refund", resource)).toBe(true);
  });
});

describe("staff invites", () => {
  it("lets a manager invite only name + PIN roles", () => {
    const manager = actorFor("manager");

    const invite = (targetRole: VenueRole) =>
      can(manager, "staff.invite", { venueId: venueA, targetRole });

    expect(invite("bartender")).toBe(true);
    expect(invite("vip_host")).toBe(true);
    expect(invite("manager")).toBe(false);
    expect(invite("owner")).toBe(false);
  });
});

describe("impersonation", () => {
  const platformActor = (
    platformRole: PlatformRole,
    confirmedWrite?: boolean,
  ): Actor => ({
    kind: "user",
    userId: "staff-1",
    memberships: [],
    platformRole,
    confirmedWrite,
  });

  it("is read-only without an explicit write confirmation", () => {
    const support = platformActor("support");
    const admin = platformActor("admin");

    expect(can(support, "report.viewAll", { venueId: venueA })).toBe(true);
    expect(
      can(support, "order.refund", { venueId: venueA, amountHuf: 1 }),
    ).toBe(false);
    expect(can(admin, "venue.editSettings", { venueId: venueA })).toBe(false);
    expect(() =>
      requirePermission(admin, "staff.invite", { venueId: venueA }),
    ).toThrow(Forbidden);
  });

  it("allows matrix writes once the write is confirmed", () => {
    const support = platformActor("support", true);

    expect(
      can(support, "order.refund", { venueId: venueB, amountHuf: 1 }),
    ).toBe(true);
    expect(can(support, "menu.edit", { venueId: venueB })).toBe(false);
  });

  it("keeps finance read-only even with a confirmation", () => {
    const finance = platformActor("finance", true);

    expect(can(finance, "report.viewAll", { venueId: venueA })).toBe(true);
    expect(
      can(finance, "order.refund", { venueId: venueA, amountHuf: 1 }),
    ).toBe(false);
  });

  it("does not need a confirmation for platform-scope actions", () => {
    expect(
      can(platformActor("admin"), "venue.suspend", { venueId: venueA }),
    ).toBe(true);
  });
});

describe("Forbidden", () => {
  it("carries the 403 status and the action", () => {
    const error = (() => {
      try {
        requirePermission(actorFor("bartender"), "payout.manage", {
          venueId: venueA,
        });
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(Forbidden);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 403,
      code: "forbidden",
      action: "payout.manage",
    });
  });
});
