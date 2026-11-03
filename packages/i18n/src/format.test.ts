import { describe, expect, it } from "vitest";

import { formatDateTime, formatHuf } from "./format";

// Intl separates groups and the currency with a no-break space (U+00A0).
const nbsp = " ";

describe("formatHuf", () => {
  it.each([
    [1990, `1${nbsp}990${nbsp}Ft`],
    [12990, `12${nbsp}990${nbsp}Ft`],
    [0, `0${nbsp}Ft`],
    [-500, `-500${nbsp}Ft`],
  ])("formats %i as %s", (amount, expected) => {
    expect(formatHuf(amount)).toBe(expected);
  });

  it.each([12.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s",
    (amount) => {
      expect(() => formatHuf(amount)).toThrow(RangeError);
    },
  );
});

describe("formatDateTime", () => {
  it("shows Budapest time for a UTC instant", () => {
    // 22:30 UTC in summer is 00:30 the next day in Budapest (CEST).
    const result = formatDateTime(new Date("2026-07-10T22:30:00Z"), "hu");
    expect(result).toContain("júl. 11.");
    expect(result).toContain("0:30");
  });
});
