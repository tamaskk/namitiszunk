import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deviceId } from "./device-id";

const KEY = "namitiszunk:device-id";
const store = new Map<string, string>();
const now = Date.UTC(2026, 10, 7, 22);
const day = 24 * 60 * 60 * 1000;

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

describe("deviceId", () => {
  it("keeps one id for a day, then replaces it", () => {
    const first = deviceId(now);

    const sameDay = deviceId(now + day - 1);
    const nextDay = deviceId(now + day);

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(sameDay).toBe(first);
    expect(nextDay).not.toBe(first);
  });

  it("replaces an edited value instead of sending it", () => {
    store.set(KEY, JSON.stringify({ id: "not-a-uuid", createdAt: now }));

    const id = deviceId(now);

    expect(id).not.toBe("not-a-uuid");
    expect(JSON.parse(store.get(KEY)!).id).toBe(id);
  });

  it("keeps one id for the page when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    const first = deviceId(now);
    const second = deviceId(now);

    expect(second).toBe(first);
  });
});
