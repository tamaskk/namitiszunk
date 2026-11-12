import { describe, expect, it } from "vitest";

import { accentIsReadable, contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("gives 21:1 for white on black and 1:1 for a colour on itself", () => {
    const extremes = contrastRatio("#ffffff", "#000000");

    const same = contrastRatio("#c8ff2e", "#c8ff2e");

    expect(extremes).toBeCloseTo(21, 5);
    expect(same).toBe(1);
  });
});

describe("accentIsReadable", () => {
  it("accepts the default neon accent and refuses a dark navy on the dark background", () => {
    const neon = accentIsReadable("#C8FF2E");

    const navy = accentIsReadable("#1e3a8a");

    expect(neon).toBe(true);
    expect(navy).toBe(false);
  });

  it("refuses a malformed colour", () => {
    expect(accentIsReadable("red")).toBe(false);
  });
});
