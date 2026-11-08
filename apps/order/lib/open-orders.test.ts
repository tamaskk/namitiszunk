import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetOpenOrder,
  readOpenOrders,
  rememberOpenOrder,
} from "./open-orders";

const KEY = "namitiszunk:open-orders";
const store = new Map<string, string>();
const now = Date.UTC(2026, 10, 7, 22);
const hour = 60 * 60 * 1000;

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("open orders", () => {
  it("remembers an order once and forgets it", () => {
    rememberOpenOrder({ orderId: "a", token: "t1" }, now);
    rememberOpenOrder({ orderId: "a", token: "t1" }, now);

    const before = readOpenOrders(now);
    forgetOpenOrder("a");

    expect(before).toEqual([{ orderId: "a", token: "t1", savedAt: now }]);
    expect(readOpenOrders(now)).toEqual([]);
  });

  it("drops orders older than 12 hours", () => {
    rememberOpenOrder({ orderId: "old", token: "t1" }, now - 13 * hour);
    rememberOpenOrder({ orderId: "new", token: "t2" }, now);

    const orders = readOpenOrders(now);

    expect(orders.map((o) => o.orderId)).toEqual(["new"]);
  });

  it("reads corrupt storage as empty", () => {
    store.set(KEY, "{not json");

    const orders = readOpenOrders(now);

    expect(orders).toEqual([]);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });

    const act = () => rememberOpenOrder({ orderId: "a", token: "t" }, now);

    expect(act).not.toThrow();
    expect(readOpenOrders(now)).toEqual([]);
  });
});
