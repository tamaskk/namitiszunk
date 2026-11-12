import { describe, expect, it } from "vitest";

import { bpsToPercent, percentToBps, toInt } from "./form-numbers";

describe("percentToBps", () => {
  it.each([
    ["12,5", 1250],
    ["12.5", 1250],
    ["0.07", 7],
    [" 15 ", 1500],
    ["100", 10_000],
  ])("reads %s as %i basis points", (typed, bps) => {
    expect(percentToBps(typed)).toBe(bps);
  });

  it.each(["", "abc", "12.345", "-5", "1e2"])(
    "refuses %j instead of rounding or guessing",
    (typed) => {
      expect(percentToBps(typed)).toBeNaN();
    },
  );
});

describe("toInt and bpsToPercent", () => {
  it("leaves an empty field as NaN and shows basis points as a percentage again", () => {
    const empty = toInt("  ");

    const shown = bpsToPercent(1250);

    expect(empty).toBeNaN();
    expect(shown).toBe("12.5");
  });
});
