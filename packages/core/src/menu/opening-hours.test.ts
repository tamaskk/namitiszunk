import { describe, expect, it } from "vitest";

import { openingState } from "./opening-hours";

const tz = "Europe/Budapest";
// Friday and Saturday nights, 22:00 to 04:00 the next morning.
const weekend = [
  { day: 5, open: "22:00", close: "04:00" },
  { day: 6, open: "22:00", close: "04:00" },
];

describe("openingState", () => {
  it("is orderable inside an opening that runs past midnight, until the last order", () => {
    const now = new Date("2026-11-07T01:30:00+01:00"); // Saturday 01:30, Friday's night

    const state = openingState(weekend, 15, tz, now);

    expect(state).toEqual({
      orderable: true,
      lastOrderAt: new Date("2026-11-07T03:45:00+01:00"),
      nextOpenAt: null,
    });
  });

  it("stops orders after the last order and points to the next opening", () => {
    const now = new Date("2026-11-07T03:50:00+01:00");

    const state = openingState(weekend, 15, tz, now);

    expect(state).toEqual({
      orderable: false,
      lastOrderAt: null,
      nextOpenAt: new Date("2026-11-07T22:00:00+01:00"),
    });
  });

  it("is closed on a weekday and opens on Friday evening", () => {
    const now = new Date("2026-11-10T20:00:00+01:00"); // Tuesday

    const state = openingState(weekend, 15, tz, now);

    expect(state.orderable).toBe(false);
    expect(state.nextOpenAt).toEqual(new Date("2026-11-13T22:00:00+01:00"));
  });

  it("keeps local wall-clock times across the autumn DST change", () => {
    // Saturday 2026-10-24 22:00 CEST to Sunday 04:00 CET (clocks went back at 03:00).
    const now = new Date("2026-10-25T03:30:00+01:00");

    const state = openingState(weekend, 15, tz, now);

    expect(state.lastOrderAt).toEqual(new Date("2026-10-25T03:45:00+01:00"));
  });

  it("leaves ordering to the bar switch when no hours are set", () => {
    const state = openingState(undefined, 15, tz, new Date());

    expect(state).toEqual({
      orderable: true,
      lastOrderAt: null,
      nextOpenAt: null,
    });
  });
});
