import { describe, expect, it } from "vitest";

import { diffCounts } from "./verify-restore";

describe("diffCounts", () => {
  it("reports nothing when every collection matches", () => {
    const counts = { orders: 120, venues: 1 };

    const result = diffCounts(counts, { ...counts });

    expect(result).toEqual([]);
  });

  it("reports a collection whose count differs", () => {
    const expected = { orders: 120, venues: 1 };
    const actual = { orders: 118, venues: 1 };

    const result = diffCounts(expected, actual);

    expect(result).toEqual([
      { collection: "orders", expected: 120, actual: 118 },
    ]);
  });

  it("reports collections missing on either side", () => {
    const expected = { orders: 120, payments: 40 };
    const actual = { orders: 120, sessions: 3 };

    const result = diffCounts(expected, actual);

    expect(result).toEqual([
      { collection: "payments", expected: 40, actual: null },
      { collection: "sessions", expected: null, actual: 3 },
    ]);
  });

  it("treats an empty collection as present", () => {
    const result = diffCounts({ orders: 0 }, {});

    expect(result).toEqual([
      { collection: "orders", expected: 0, actual: null },
    ]);
  });
});
