// Pure and client-safe: type-only imports plus the dependency-free errors module, so the UI can use
// `can` to hide controls. The server must still call `requirePermission` at every entry point and in the service.
import type { platformRoles, venueRoles } from "@namitiszunk/db";

import { AppError } from "../errors";

export type VenueRole = (typeof venueRoles)[number];
export type PlatformRole = (typeof platformRoles)[number];
export type Role = "guest" | "system" | VenueRole | PlatformRole;

/** A venue role as stored on an active VenueMember. Callers pass only active memberships. */
export type VenueMembership = {
  venueId: string;
  memberId: string;
  role: VenueRole;
};

export type Actor =
  /** A guest identified by their guest session (phone OTP or anonymous token). */
  | { kind: "guest"; guestId: string }
  /** The Stripe webhook or an Inngest job; it may only pay, cancel (payment timeout), expire and auto-refund orders. */
  | { kind: "system"; source: "stripe" | "inngest" }
  /**
   * The active PIN holder on a club tablet. The tablet signs in with the venue account,
   * but the acting role and the logged actor are this member, never the venue account.
   */
  | { kind: "staff"; venueId: string; memberId: string; role: VenueRole }
  /**
   * A signed-in user. `platformRole` comes from an active PlatformMember. A platform actor
   * acting for a venue is read-only unless `confirmedWrite` is set by an explicit confirmation step.
   */
  | {
      kind: "user";
      userId: string;
      memberships: readonly VenueMembership[];
      platformRole?: PlatformRole;
      confirmedWrite?: boolean;
    };

export type Resource = {
  venueId?: string;
  /** Owner of the order, for a guest's `order.reject`. */
  guestId?: string;
  /** Refund amount in integer forints, for `order.refund`. */
  amountHuf?: number;
  /** Venue setting: null means no limit; undefined means not loaded, so a manager is denied. */
  managerRefundLimitHuf?: number | null;
  /** Role being granted, for `staff.invite`. */
  targetRole?: VenueRole;
};

/** true: allowed. A string: allowed only when that condition holds on the resource. */
type Cell = true | "own" | "upToRefundLimit" | "pinRolesOnly";

type Rule = {
  /** "platform" actions are not tied to one venue (impersonation rules do not apply). */
  scope: "venue" | "platform";
  /** Writes need `confirmedWrite` when a platform actor acts for a venue. */
  write: boolean;
  roles: Partial<Record<Role, Cell>>;
};

// Single source of the permission matrix (product doc, rev 306). Change the product doc with it.
export const permissions = {
  "order.create": { scope: "venue", write: true, roles: { guest: true } },
  // Order transitions: the state machine (T-021) calls requirePermission(actor, "order.<event>").
  // Guest cancel before acceptance is the `reject` event on the guest's own order.
  // `cancel` is the payment timeout, not a guest action.
  "order.pay": { scope: "venue", write: true, roles: { system: true } },
  "order.cancel": { scope: "venue", write: true, roles: { system: true } },
  "order.expire": { scope: "venue", write: true, roles: { system: true } },
  "order.start": {
    scope: "venue",
    write: true,
    roles: { bartender: true, manager: true, owner: true },
  },
  "order.ready": {
    scope: "venue",
    write: true,
    roles: { bartender: true, manager: true, owner: true },
  },
  "order.pickUp": {
    scope: "venue",
    write: true,
    roles: { bartender: true, manager: true, owner: true },
  },
  "order.reject": {
    scope: "venue",
    write: true,
    roles: { guest: "own", bartender: true, manager: true, owner: true },
  },
  "order.handOverVip": {
    scope: "venue",
    write: true,
    roles: { vip_host: true, manager: true, owner: true },
  },
  "order.viewTakeOutList": {
    scope: "venue",
    write: false,
    roles: { vip_host: true, manager: true, owner: true },
  },
  "product.setSoldOut": {
    scope: "venue",
    write: true,
    roles: { bartender: true, manager: true, owner: true },
  },
  "bar.pauseOrders": {
    scope: "venue",
    write: true,
    roles: { bartender: true, manager: true, owner: true },
  },
  "order.refund": {
    scope: "venue",
    write: true,
    roles: {
      // The automatic refund of an expired order; the state machine allows it only with refundOnExpiry.
      system: true,
      manager: "upToRefundLimit",
      owner: true,
      support: true,
      admin: true,
    },
  },
  "menu.edit": {
    scope: "venue",
    write: true,
    roles: { manager: true, owner: true },
  },
  "venue.manageBars": {
    scope: "venue",
    write: true,
    roles: { manager: true, owner: true },
  },
  "report.viewDaily": {
    scope: "venue",
    write: false,
    roles: {
      manager: true,
      owner: true,
      support: true,
      admin: true,
      finance: true,
    },
  },
  "report.viewAll": {
    scope: "venue",
    write: false,
    roles: { owner: true, support: true, admin: true, finance: true },
  },
  "staff.invite": {
    scope: "venue",
    write: true,
    roles: { manager: "pinRolesOnly", owner: true, admin: true },
  },
  "payout.manage": { scope: "venue", write: true, roles: { owner: true } },
  "venue.editSettings": {
    scope: "venue",
    write: true,
    roles: { owner: true, admin: true },
  },
  "billing.view": {
    scope: "venue",
    write: false,
    roles: { owner: true, admin: true },
  },
  "venue.create": { scope: "platform", write: true, roles: { admin: true } },
  "venue.suspend": { scope: "platform", write: true, roles: { admin: true } },
  "venue.impersonate": {
    scope: "platform",
    write: false,
    roles: { support: true, admin: true },
  },
  "plan.edit": { scope: "platform", write: true, roles: { admin: true } },
  "platformReport.view": {
    scope: "platform",
    write: false,
    roles: { admin: true, finance: true },
  },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof permissions;

/** The roles that may sign in with a PIN on a staff device; owners and managers use their own account. */
export const pinRoles: readonly VenueRole[] = ["bartender", "vip_host"];

function cellAllows(
  cell: Cell | undefined,
  actor: Actor,
  resource: Resource,
): boolean {
  switch (cell) {
    case undefined:
      return false;
    case true:
      return true;
    case "own":
      return (
        actor.kind === "guest" &&
        actor.guestId !== "" &&
        resource.guestId === actor.guestId
      );
    case "pinRolesOnly":
      return (
        resource.targetRole !== undefined &&
        pinRoles.includes(resource.targetRole)
      );
    case "upToRefundLimit": {
      const limit = resource.managerRefundLimitHuf;
      if (limit === null) return true;
      // Fail closed: a limit the caller did not load cannot be checked.
      if (limit === undefined) return false;
      const amount = resource.amountHuf;
      // Fail closed: an unknown or non-integer amount cannot be checked against the limit.
      return Number.isInteger(amount) && (amount as number) <= limit;
    }
  }
}

/** The venue role always comes from the membership for this venue, never a global role. */
function venueRoleFor(actor: Actor, venueId: string): VenueRole | undefined {
  if (actor.kind === "staff")
    return actor.venueId === venueId ? actor.role : undefined;
  if (actor.kind === "user")
    return actor.memberships.find((m) => m.venueId === venueId)?.role;
  return undefined;
}

export function can(
  actor: Actor,
  action: Action,
  resource: Resource = {},
): boolean {
  const rule: Rule = permissions[action];
  const platformRole = actor.kind === "user" ? actor.platformRole : undefined;

  if (rule.scope === "platform")
    return (
      platformRole !== undefined &&
      cellAllows(rule.roles[platformRole], actor, resource)
    );

  const { venueId } = resource;
  if (!venueId) return false;

  if (actor.kind === "guest" || actor.kind === "system")
    return cellAllows(rule.roles[actor.kind], actor, resource);

  const venueRole = venueRoleFor(actor, venueId);
  if (venueRole && cellAllows(rule.roles[venueRole], actor, resource))
    return true;

  if (platformRole === undefined) return false;
  if (rule.write && !(actor.kind === "user" && actor.confirmedWrite === true))
    return false;
  return cellAllows(rule.roles[platformRole], actor, resource);
}

/** Thrown when an actor lacks a permission. The API wrapper maps it to 403. */
export class Forbidden extends AppError {
  constructor(readonly action: Action) {
    super(403, "forbidden");
    this.message = `Forbidden: ${action}`;
    this.name = "Forbidden";
  }
}

export function requirePermission(
  actor: Actor,
  action: Action,
  resource: Resource = {},
): void {
  if (!can(actor, action, resource)) throw new Forbidden(action);
}
