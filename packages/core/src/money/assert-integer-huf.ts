/**
 * Guards the integer-forint rule: amounts are whole forints, never floats.
 * The sign is not checked here: refunds may be negative, prices and totals may not,
 * so each caller enforces the sign its domain needs.
 */
export function assertIntegerHuf(amountHuf: number): number {
  if (!Number.isSafeInteger(amountHuf)) {
    throw new RangeError(
      `Amount must be a whole number of forints, got ${amountHuf}`,
    );
  }
  // -0 would leak into formatting and equality checks as "-0 Ft".
  return amountHuf === 0 ? 0 : amountHuf;
}
