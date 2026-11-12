import { describe, expect, it } from "vitest";

import { fieldErrorKeys } from "./shared";
import { venueSettingsInputSchema } from "./venues";

function errorKeys(input: unknown): Record<string, string> {
  const result = venueSettingsInputSchema.safeParse(input);
  return result.success ? {} : fieldErrorKeys(result.error);
}

const basics = {
  tab: "basics",
  name: "Klub",
  address: { street: "", city: "", postalCode: "" },
  company: { name: "", taxNumber: "" },
  contactEmail: "",
};
const order = {
  tab: "order",
  autoAccept: true,
  pickupDeadlineMinutes: 30,
  refundOnExpiry: false,
  maxItemsPerOrder: 10,
  minimumOrderHuf: 0,
  lastOrderMinutesBeforeClose: 15,
  serviceFee: { type: "none", value: 0 },
  tips: { enabled: true, presetsBps: [500, 1000, 1500] },
};

describe("venueSettingsInputSchema (T-058)", () => {
  it("accepts each tab with empty optional fields", () => {
    expect(errorKeys(basics)).toEqual({});
    expect(errorKeys(order)).toEqual({});
  });

  it.each([
    ["12345678-1-12", {}],
    ["12345678112", { "company.taxNumber": "validation.taxNumber.format" }],
    ["12345678-9-12", { "company.taxNumber": "validation.taxNumber.format" }],
  ])("checks the tax number %s", (taxNumber, expected) => {
    const input = { ...basics, company: { name: "", taxNumber } };

    expect(errorKeys(input)).toEqual(expected);
  });

  it("refuses a close equal to the open and a day given twice", () => {
    const hours = (openingHours: unknown) => ({
      tab: "hours",
      businessDayStart: "06:00",
      openingHours,
    });

    const same = errorKeys(hours([{ day: 5, open: "22:00", close: "22:00" }]));
    const twice = errorKeys(
      hours([
        { day: 5, open: "22:00", close: "05:00" },
        { day: 5, open: "18:00", close: "20:00" },
      ]),
    );

    expect(same).toEqual({
      "openingHours.0.close": "validation.hours.sameTime",
    });
    expect(twice).toEqual({ openingHours: "validation.hours.dayTwice" });
  });

  it("lowercases the accent and refuses anything but #rrggbb", () => {
    const branding = (accentColor: string) => ({
      tab: "branding",
      logoUrl: "",
      coverUrl: "",
      accentColor,
    });

    const parsed = venueSettingsInputSchema.parse(branding("#C8FF2E"));

    expect(parsed).toMatchObject({ accentColor: "#c8ff2e" });
    expect(errorKeys(branding("red;}"))).toEqual({
      accentColor: "validation.color.hex",
    });
  });

  it("wants three different tip presets between 0.01% and 100%", () => {
    const tips = (presetsBps: number[]) => ({
      ...order,
      tips: { enabled: true, presetsBps },
    });

    expect(errorKeys(tips([500, 1000]))).toHaveProperty(["tips.presetsBps"]);
    expect(errorKeys(tips([1000, 1000, 1500]))).toEqual({
      "tips.presetsBps": "validation.tips.distinct",
    });
    expect(errorKeys(tips([0, 1000, 10_001]))).toEqual({
      "tips.presetsBps.0": "validation.tips.preset",
      "tips.presetsBps.2": "validation.tips.preset",
    });
  });

  it("caps a percent service fee at 100% and the pickup deadline at 15–60", () => {
    const input = {
      ...order,
      pickupDeadlineMinutes: 90,
      serviceFee: { type: "percent", value: 10_001 },
    };

    expect(errorKeys(input)).toEqual({
      pickupDeadlineMinutes: "validation.pickupDeadline.max",
      "serviceFee.value": "validation.bps.max",
    });
  });
});
