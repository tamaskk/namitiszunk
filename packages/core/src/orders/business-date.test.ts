import { describe, expect, it } from "vitest";

import { businessDate } from "./business-date";

const venue = { timezone: "Europe/Budapest", businessDayStart: "06:00" };

describe("businessDate", () => {
  it.each([
    // Winter (CET, UTC+1)
    ["2026-11-07T04:59:00Z", "2026-11-06"], // 05:59 local
    ["2026-11-07T05:00:00Z", "2026-11-07"], // 06:00 local
    ["2026-11-06T23:30:00Z", "2026-11-06"], // 00:30 local, after midnight
    // Summer (CEST, UTC+2)
    ["2026-07-04T03:59:00Z", "2026-07-03"], // 05:59 local
    ["2026-07-04T04:00:00Z", "2026-07-04"], // 06:00 local
    // Last Sunday of March 2026: 02:00 CET jumps to 03:00 CEST
    ["2026-03-29T00:30:00Z", "2026-03-28"], // 01:30 CET
    ["2026-03-29T01:30:00Z", "2026-03-28"], // 03:30 CEST
    ["2026-03-29T03:59:00Z", "2026-03-28"], // 05:59 CEST
    ["2026-03-29T04:00:00Z", "2026-03-29"], // 06:00 CEST
    // Last Sunday of October 2026: 03:00 CEST falls back to 02:00 CET
    ["2026-10-25T00:30:00Z", "2026-10-24"], // 02:30 CEST
    ["2026-10-25T01:30:00Z", "2026-10-24"], // 02:30 CET (repeated hour)
    ["2026-10-25T04:59:00Z", "2026-10-24"], // 05:59 CET
    ["2026-10-25T05:00:00Z", "2026-10-25"], // 06:00 CET
    // Month and year boundaries
    ["2027-01-01T03:00:00Z", "2026-12-31"], // 04:00 local on New Year's Day
  ])("%s belongs to %s", (instant, expected) => {
    expect(businessDate(new Date(instant), venue)).toBe(expected);
  });

  it("honours a custom business day start", () => {
    const late = { ...venue, businessDayStart: "04:30" };
    expect(businessDate(new Date("2026-11-07T03:29:00Z"), late)).toBe(
      "2026-11-06",
    );
    expect(businessDate(new Date("2026-11-07T03:30:00Z"), late)).toBe(
      "2026-11-07",
    );
  });
});
