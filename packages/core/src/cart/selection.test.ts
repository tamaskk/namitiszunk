import { describe, expect, it } from "vitest";

import {
  optionsHufOf,
  validateSelection,
  type SelectableGroup,
} from "./selection";

const size: SelectableGroup = {
  id: "size",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  modifiers: [
    { id: "small", priceDeltaHuf: 0 },
    { id: "large", priceDeltaHuf: 400 },
  ],
};
const extras: SelectableGroup = {
  id: "extras",
  required: false,
  minSelect: 0,
  maxSelect: 2,
  modifiers: [
    { id: "double", priceDeltaHuf: 900 },
    { id: "sugarFree", priceDeltaHuf: 0 },
    { id: "lime", priceDeltaHuf: 100 },
  ],
};

describe("validateSelection", () => {
  it("accepts a valid radio pick and up to max checkbox picks", () => {
    const groups = [size, extras];

    const problems = validateSelection(groups, ["large", "double", "lime"]);

    expect(problems).toEqual([]);
  });

  it("names a required group that has no pick", () => {
    const problems = validateSelection([size, extras], ["double"]);

    expect(problems).toEqual([{ groupId: "size", reason: "missing" }]);
  });

  it("treats a required group with minSelect 0 as needing one pick", () => {
    const groups = [{ ...size, minSelect: 0 }];

    expect(validateSelection(groups, [])).toEqual([
      { groupId: "size", reason: "missing" },
    ]);
  });

  it("enforces minSelect on an optional group", () => {
    const groups = [{ ...extras, minSelect: 2 }];

    expect(validateSelection(groups, ["lime"])).toEqual([
      { groupId: "extras", reason: "missing" },
    ]);
  });

  it("refuses more picks than maxSelect, for radio and checkbox groups", () => {
    const problems = validateSelection(
      [size, extras],
      ["small", "large", "double", "sugarFree", "lime"],
    );

    expect(problems).toEqual([
      { groupId: "size", reason: "tooMany" },
      { groupId: "extras", reason: "tooMany" },
    ]);
  });

  it("flags a modifier of another item and a repeated id", () => {
    expect(validateSelection([size], ["small", "foreign"])).toEqual([
      { groupId: null, reason: "unknown" },
    ]);
    expect(validateSelection([size], ["small", "small"])).toEqual([
      { groupId: null, reason: "unknown" },
    ]);
  });
});

describe("optionsHufOf", () => {
  it("sums the surcharges of the chosen modifiers", () => {
    expect(optionsHufOf([size, extras], ["large", "double", "lime"])).toBe(
      1400,
    );
  });
});
