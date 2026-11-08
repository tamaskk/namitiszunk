import { subtotalOf } from "@namitiszunk/core";
import { MAX_QUANTITY_PER_LINE } from "@namitiszunk/validators/cart-limits";
import { useCallback, useSyncExternalStore } from "react";

/** One cart line as the guest saw it; the server re-checks every field at "Tovább" and at payment. */
export type CartLine = {
  /** Item and options: the same choice added twice lands on one line. */
  key: string;
  itemId: string;
  name: string;
  /** Base price plus the chosen surcharges, integer forints; display only. */
  unitPriceHuf: number;
  quantity: number;
  modifierIds: string[];
  /** The chosen option names, for the cart line. */
  options: string[];
};

const EMPTY: CartLine[] = [];
const PREFIX = "namitiszunk:cart:";
const listeners = new Set<() => void>();
const cache = new Map<string, CartLine[]>();

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isLine = (value: unknown): value is CartLine => {
  const line = value as Partial<CartLine> | null;
  return (
    typeof line === "object" &&
    line !== null &&
    typeof line.key === "string" &&
    typeof line.itemId === "string" &&
    typeof line.name === "string" &&
    Number.isSafeInteger(line.unitPriceHuf) &&
    line.unitPriceHuf! >= 0 &&
    Number.isSafeInteger(line.quantity) &&
    line.quantity! >= 1 &&
    line.quantity! <= MAX_QUANTITY_PER_LINE &&
    isStringArray(line.modifierIds) &&
    isStringArray(line.options)
  );
};

/** The stored cart, keeping only well-formed lines: a stale or tampered entry never crashes the menu. */
export function parseStoredCart(raw: string | null): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return EMPTY;
    // Only the known fields survive: an older cart's note (hidden until T-047) is dropped here.
    return parsed.filter(isLine).map((line) => ({
      key: line.key,
      itemId: line.itemId,
      name: line.name,
      unitPriceHuf: line.unitPriceHuf,
      quantity: line.quantity,
      modifierIds: line.modifierIds,
      options: line.options,
    }));
  } catch {
    return EMPTY;
  }
}

export const lineKey = (itemId: string, modifierIds: string[]) =>
  JSON.stringify([itemId, [...modifierIds].sort()]);

/** Adds a line: the same choice adds up on its line up to the per-line cap, the rest starts a new line. */
export function withLine(lines: CartLine[], line: CartLine): CartLine[] {
  const same = lines.find((l) => l.key === line.key);
  if (!same) return [...lines, line];
  const merged = Math.min(MAX_QUANTITY_PER_LINE, same.quantity + line.quantity);
  const rest = same.quantity + line.quantity - merged;
  const next = lines.map((l) => (l === same ? { ...l, quantity: merged } : l));
  if (rest === 0) return next;
  // Only a venue limit above the per-line cap gets here; the suffix keeps keys unique and stable.
  let n = 2;
  while (lines.some((l) => l.key === `${line.key}#${n}`)) n++;
  return [...next, { ...line, key: `${line.key}#${n}`, quantity: rest }];
}

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

function read(venueId: string): CartLine[] {
  const cached = cache.get(venueId);
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + venueId);
  } catch {
    // Storage blocked (private mode): start with an empty cart.
  }
  const lines = parseStoredCart(raw);
  cache.set(venueId, lines);
  return lines;
}

const notify = () => {
  for (const listener of listeners) listener();
};

function write(venueId: string, lines: CartLine[]) {
  cache.set(venueId, lines);
  try {
    localStorage.setItem(PREFIX + venueId, JSON.stringify(lines));
  } catch {
    // Storage blocked or full: the cart holds for this page only.
  }
  notify();
}

// Another tab changed a cart: drop that venue's cached copy so the next read sees it.
function onStorage(event: StorageEvent) {
  if (event.key === null) cache.clear();
  else if (event.key.startsWith(PREFIX)) {
    cache.delete(event.key.slice(PREFIX.length));
  } else return;
  notify();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Adds lines to a venue's cart outside React ("Rendeld újra", T-045 and T-047); same choices merge. */
export function addToCart(venueId: string, lines: readonly CartLine[]) {
  write(venueId, lines.reduce(withLine, read(venueId)));
}

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
