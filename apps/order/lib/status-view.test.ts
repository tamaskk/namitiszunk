import { describe, expect, it } from "vitest";

import { statusView } from "./status-view";

describe("statusView", () => {
  it("shows the full-screen signal and keeps the screen awake only when ready", () => {
    const view = statusView("ready");

    expect(view).toMatchObject({ ready: true, wakeLock: true, final: false });
  });

  it.each(["new", "preparing"] as const)(
    "keeps the screen awake while %s",
    (status) => {
      const view = statusView(status);

      expect(view).toMatchObject({
        ready: false,
        wakeLock: true,
        final: false,
      });
    },
  );

  it.each([
    "picked_up",
    "rejected",
    "refunded",
    "expired",
    "cancelled",
  ] as const)("treats %s as final", (status) => {
    const view = statusView(status);

    expect(view).toMatchObject({ final: true, wakeLock: false, ready: false });
  });

  it("does not hold a wake lock while the payment is processing", () => {
    const view = statusView("awaiting_payment");

    expect(view).toMatchObject({ wakeLock: false, final: false });
  });
});
