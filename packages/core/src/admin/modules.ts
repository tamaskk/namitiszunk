import {
  type Action,
  type Actor,
  can,
  Forbidden,
  type Resource,
} from "../auth/permissions";

type AdminModule = {
  key: string;
  /** Route under the admin app; the later module tasks fill these pages. */
  path: string;
  action: Action;
  /** Extra resource fields the action needs to pass for the roles that may open the module. */
  resource?: Omit<Resource, "venueId">;
};

// Which permission opens each Admin module (T-050). Events come after the pilot (T-101).
// Viewing a module reuses the matrix action that guards its main work, so the menu and the
// server check can never disagree; the matrix itself stays the single source of roles.
export const adminModules = [
  { key: "dashboard", path: "/", action: "report.viewDaily" },
  { key: "barView", path: "/pult", action: "order.start" },
  // The VIP host's phone (T-055); a bartender's PIN cannot open it.
  { key: "vipView", path: "/vip", action: "order.viewTakeOutList" },
  { key: "orders", path: "/orders", action: "order.viewHistory" },
  { key: "menu", path: "/menu", action: "menu.edit" },
  { key: "bars", path: "/bars", action: "venue.manageBars" },
  // A manager may manage the PIN roles only, so the module opens for that much.
  {
    key: "staff",
    path: "/staff",
    action: "staff.invite",
    resource: { targetRole: "bartender" },
  },
  { key: "reports", path: "/reports", action: "report.viewDaily" },
  { key: "promos", path: "/promos", action: "venue.editSettings" },
  { key: "payouts", path: "/payouts", action: "payout.manage" },
  { key: "reviews", path: "/reviews", action: "report.viewDaily" },
  { key: "settings", path: "/settings", action: "venue.editSettings" },
  { key: "billing", path: "/billing", action: "billing.view" },
] as const satisfies readonly AdminModule[];

export type AdminModuleKey = (typeof adminModules)[number]["key"];

// Pages inside a module that need more than the module's own action (T-061: the Owner's reports).
const adminSubpages: readonly { path: string; action: Action }[] = [
  { path: "/reports/period", action: "report.viewAll" },
  { path: "/reports/staff", action: "report.viewAll" },
];

/** Whether the actor may open the path beyond its module's own check; true outside such pages. */
export function canOpenSubpage(
  actor: Actor,
  path: string,
  venueId: string,
): boolean {
  const page = adminSubpages.find(
    (p) => path === p.path || path.startsWith(`${p.path}/`),
  );
  return !page || can(actor, page.action, { venueId });
}

export function canOpenModule(
  actor: Actor,
  key: AdminModuleKey,
  venueId: string,
): boolean {
  const module: AdminModule = adminModules.find((m) => m.key === key)!;
  return can(actor, module.action, { ...module.resource, venueId });
}

/** The server check behind every Admin page: throws Forbidden (403) like `requirePermission`. */
export function requireModule(
  actor: Actor,
  key: AdminModuleKey,
  venueId: string,
): void {
  const module: AdminModule = adminModules.find((m) => m.key === key)!;
  if (!canOpenModule(actor, key, venueId)) throw new Forbidden(module.action);
}
