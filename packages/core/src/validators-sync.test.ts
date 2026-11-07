import * as db from "@namitiszunk/db";
import * as validators from "@namitiszunk/validators";
import { describe, expect, it, vi } from "vitest";

import { TIP_PERCENT_BPS } from "./pricing/calculate-order";

// "server-only" throws outside a React Server Components bundle; packages/db imports it.
vi.mock("server-only", () => ({}));

// packages/validators is a leaf package and cannot import db or core, so it repeats their literals.
// core sees all three, so it is where a drift fails CI.
describe("validators stay in sync with the models and pricing", () => {
  it.each([
    "orderStatuses",
    "vatRates",
    "discountTypes",
    "venueStatuses",
    "serviceFeeTypes",
    "zoneTypes",
    "venueRoles",
    "platformRoles",
    "locales",
  ] as const)("%s matches packages/db", (name) => {
    const fromDb = db[name];

    const fromValidators = validators[name];

    expect(fromValidators).toEqual(fromDb);
  });

  it("tip presets match the pricing calculation", () => {
    const fromCore = TIP_PERCENT_BPS;

    const fromValidators = validators.TIP_PERCENT_BPS;

    expect(fromValidators).toEqual(fromCore);
  });
});
