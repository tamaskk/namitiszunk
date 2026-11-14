import {
  type Action,
  type Actor,
  can,
  Forbidden,
  type PlatformRole,
} from "../auth/permissions";

// Which platform permission opens each HQ module (T-066); the module tasks (T-067–T-073) fill the
// pages. Opening a module reuses the matrix action that guards its main work, so the menu and
// the server check cannot disagree; Support and Finance get their screens after the pilot (T-113).
export const hqModules = [
  { key: "venues", path: "/venues", action: "venue.create" },
  // Finding a guest's order is Support's daily work, the same people who may look into a venue.
  { key: "orders", path: "/orders", action: "venue.impersonate" },
  // A lead becomes a venue: the same people may work on both.
  { key: "leads", path: "/leads", action: "venue.create" },
  { key: "finance", path: "/finance", action: "platformReport.view" },
  { key: "audit", path: "/audit", action: "platformReport.view" },
] as const satisfies readonly { key: string; path: string; action: Action }[];

export type HqModuleKey = (typeof hqModules)[number]["key"];

/** A signed-in user with an active platform role: the only one HQ lets past its sign-in. */
export type PlatformActor = Extract<Actor, { kind: "user" }> & {
  platformRole: PlatformRole;
};

export function isPlatformActor(actor: Actor): actor is PlatformActor {
  return actor.kind === "user" && actor.platformRole !== undefined;
}

export function canOpenHqModule(actor: Actor, key: HqModuleKey): boolean {
  const module = hqModules.find((m) => m.key === key)!;
  return can(actor, module.action);
}

/** The server check behind every HQ page: throws Forbidden (403) like `requirePermission`. */
export function requireHqModule(actor: Actor, key: HqModuleKey): void {
  const module = hqModules.find((m) => m.key === key)!;
  if (!can(actor, module.action)) throw new Forbidden(module.action);
}
