import { describe, expect, it } from "vitest";

import { parseStoredCart, withLine, type CartLine } from "./use-cart";

const line: CartLine = {
  key: '["a",[]]',
  itemId: "a",
  name: "Gin tonik",
  unitPriceHuf: 2490,
  quantity: 2,
  modifierIds: [],
  options: [],
};

describe("parseStoredCart", () => {
  it("keeps good lines and drops malformed ones without throwing", () => {
    const raw = JSON.stringify([
      line,
      null,
      "x",
      { ...line, unitPriceHuf: -1 },
      { ...line, unitPriceHuf: 99.5 },
      { ...line, quantity: 0 },
      { ...line, quantity: 11 },
      { ...line, modifierIds: [1] },
      { ...line, options: "Lime" },
      { ...line, name: undefined },
    ]);

    const lines = parseStoredCart(raw);

    expect(lines).toEqual([line]);
  });

  it("reads broken JSON, a non-array and nothing as an empty cart", () => {
    expect(parseStoredCart("{oops")).toEqual([]);
    expect(parseStoredCart('{"a":1}')).toEqual([]);
    expect(parseStoredCart(null)).toEqual([]);
  });

  it("drops the note an older cart stored (hidden until T-047)", () => {
    const raw = JSON.stringify([{ ...line, note: "Kevés jég" }]);

    expect(parseStoredCart(raw)).toEqual([line]);
  });
});

describe("withLine", () => {
  it("adds the same choice up on one line", () => {
    expect(withLine([line], { ...line, quantity: 3 })).toEqual([
      { ...line, quantity: 5 },
    ]);
  });

  it("starts a new line with a stable key once the per-line cap is reached", () => {
    const lines = withLine([{ ...line, quantity: 8 }], {
      ...line,
      quantity: 5,
    });

    expect(lines).toEqual([
      { ...line, quantity: 10 },
      { ...line, key: `${line.key}#2`, quantity: 3 },
    ]);
  });
});
