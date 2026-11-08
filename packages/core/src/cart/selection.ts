/** The venue's maxItemsPerOrder when the club has not set one (T-041). */
export const DEFAULT_MAX_ITEMS_PER_ORDER = 10;

export type SelectableGroup = {
  id: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  modifiers: readonly { id: string; priceDeltaHuf: number }[];
};

/** missing: fewer picks than the group needs; tooMany: more than it allows; unknown: an id of no group, or one sent twice. */
export type SelectionProblem =
  | { groupId: string; reason: "missing" | "tooMany" }
  | { groupId: null; reason: "unknown" };

/** A required group needs at least one pick even when its minSelect is 0. */
export const minPicks = (group: SelectableGroup) =>
  Math.max(group.minSelect, group.required ? 1 : 0);

/**
 * Checks a line's chosen modifiers against its item's groups. Pure and client-safe:
 * the product sheet and the server (validateCart, createOrder) run the same rules.
 */
export function validateSelection(
  groups: readonly SelectableGroup[],
  modifierIds: readonly string[],
): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  let known = 0;
  for (const group of groups) {
    const picked = group.modifiers.filter((m) =>
      modifierIds.includes(m.id),
    ).length;
    known += picked;
    if (picked < minPicks(group)) {
      problems.push({ groupId: group.id, reason: "missing" });
    } else if (picked > group.maxSelect) {
      problems.push({ groupId: group.id, reason: "tooMany" });
    }
  }
  // Each modifier counts once, so a foreign or repeated id leaves the counts apart.
  if (known !== modifierIds.length) {
    problems.push({ groupId: null, reason: "unknown" });
  }
  return problems;
}

/** The summed surcharge of the chosen modifiers, per unit. */
export function optionsHufOf(
  groups: readonly SelectableGroup[],
  modifierIds: readonly string[],
): number {
  return groups
    .flatMap((group) => group.modifiers)
    .filter((m) => modifierIds.includes(m.id))
    .reduce((sum, m) => sum + m.priceDeltaHuf, 0);
}
