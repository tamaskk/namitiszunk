// The checkout's Idempotency-Key (T-042), kept in sessionStorage so a double tap, a retry after a
// declined card or a reload sends the same key and the server makes one order. A changed cart, tip or
// phone gets a new key: the server would otherwise replay the first order.

const KEY = "namitiszunk:checkout-key";

type Stored = { fingerprint: string; key: string };

/** The key for this exact order request; the same request always gets the same key in this tab. */
export function checkoutKeyFor(
  request: unknown,
  storage: Storage | null,
): string {
  const fingerprint = JSON.stringify(request);
  try {
    const stored = JSON.parse(storage?.getItem(KEY) ?? "null") as Stored | null;
    if (stored?.fingerprint === fingerprint) return stored.key;
  } catch {
    // A broken entry is replaced below.
  }
  const key = crypto.randomUUID();
  try {
    storage?.setItem(KEY, JSON.stringify({ fingerprint, key }));
  } catch {
    // Storage blocked: the key still holds for this page.
  }
  return key;
}

/** After a paid order: the next checkout is a new order. */
export function forgetCheckoutKey(storage: Storage | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
