import { subtotalOf } from "@namitiszunk/core";
import { useCallback, useSyncExternalStore } from "react";

/** One cart line as the guest saw it; the server re-checks every field at "Tovább" and at payment. */
export type CartLine = {
  /** Item, options and note: the same choice added twice lands on one line. */
  key: string;
  itemId: string;
  name: string;
  /** Base price plus the chosen surcharges, integer forints; display only. */
  unitPriceHuf: number;
  quantity: number;
  modifierIds: string[];
  /** The chosen option names, for the cart line. */
  options: string[];
  note: string;
};

const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, CartLine[]>();

const storageKey = (venueId: string) => `namitiszunk:cart:${venueId}`;

const isLine = (value: unknown): value is CartLine => {
  const line = value as Partial<CartLine> | null;
  return (
    typeof line?.key === "string" &&
    typeof line.itemId === "string" &&
    typeof line.name === "string" &&
    Number.isSafeInteger(line.unitPriceHuf) &&
    Number.isSafeInteger(line.quantity) &&
    (line.quantity ?? 0) > 0 &&
    Array.isArray(line.modifierIds) &&
    Array.isArray(line.options) &&
    typeof line.note === "string"
  );
};

function read(venueId: string): CartLine[] {
  const cached = cache.get(venueId);
  if (cached) return cached;
  let lines = EMPTY;
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey(venueId)) ?? "[]",
    );
    // A stale or tampered entry is dropped; the server re-checks the rest anyway.
    if (Array.isArray(parsed)) lines = parsed.filter(isLine);
  } catch {
    // Storage blocked (private mode) or unreadable: start with an empty cart.
  }
  cache.set(venueId, lines);
  return lines;
}

function write(venueId: string, lines: CartLine[]) {
  cache.set(venueId, lines);
  try {
    localStorage.setItem(storageKey(venueId), JSON.stringify(lines));
  } catch {
    // Storage blocked or full: the cart holds for this page only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const lineKey = (itemId: string, modifierIds: string[], note: string) =>
  JSON.stringify([itemId, [...modifierIds].sort(), note]);

export const itemCount = (lines: readonly CartLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/** The same shared function createOrder prices with; the server total stays the one that counts. */
export const cartSubtotalHuf = (lines: readonly CartLine[]) =>
  lines.length === 0
    ? 0
    : subtotalOf(
        lines.map((line) => ({
          priceHuf: line.unitPriceHuf,
          optionsHuf: 0,
          quantity: line.quantity,
        })),
      );

/**
 * The guest's cart for one venue, kept in localStorage so it survives a reload. The server
 * snapshot is empty, so hydration matches and the stored cart appears right after.
 */
export function useCart(venueId: string) {
  const lines = useSyncExternalStore(
    subscribe,
    () => read(venueId),
    () => EMPTY,
  );
  const update = useCallback(
    (change: (current: CartLine[]) => CartLine[]) =>
      write(venueId, change(read(venueId))),
    [venueId],
  );
  return { lines, update };
}
