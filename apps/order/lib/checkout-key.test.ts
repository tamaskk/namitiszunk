import { describe, expect, it } from "vitest";

import { checkoutKeyFor, forgetCheckoutKey } from "./checkout-key";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const order = { barId: "b", items: [{ itemId: "i", quantity: 2 }] };

describe("checkoutKeyFor", () => {
  it("gives the same request the same key, so a double tap makes one order", () => {
    const storage = memoryStorage();

    const first = checkoutKeyFor(order, storage);
    const second = checkoutKeyFor({ ...order }, storage);

    expect(second).toBe(first);
  });

  it("gives a changed request a new key", () => {
    const storage = memoryStorage();
    const first = checkoutKeyFor(order, storage);

    const changed = checkoutKeyFor({ ...order, tip: 500 }, storage);

    expect(changed).not.toBe(first);
  });

  it("starts over after a paid order, and works without storage", () => {
    const storage = memoryStorage();
    const first = checkoutKeyFor(order, storage);

    forgetCheckoutKey(storage);
    const next = checkoutKeyFor(order, storage);

    expect(next).not.toBe(first);
    expect(checkoutKeyFor(order, null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
