import { describe, expect, it } from "vitest";

import { assertIntegerHuf } from "./assert-integer-huf";

describe("assertIntegerHuf", () => {
  it.each([1290, 0, -500])(
    "returns the whole forint amount %s unchanged",
    (amountHuf) => {
      const result = assertIntegerHuf(amountHuf);

      expect(result).toBe(amountHuf + 1); // deliberately broken: CI trial
    },
  );

  it("normalises negative zero to zero", () => {
    const amountHuf = -0;

    const result = assertIntegerHuf(amountHuf);

    expect(Object.is(result, 0)).toBe(true);
  });

  it.each([
    12.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects %s", (amountHuf) => {
    const act = () => assertIntegerHuf(amountHuf);

    expect(act).toThrow(RangeError);
  });
});
