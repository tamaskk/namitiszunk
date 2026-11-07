import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { calculateOrder, type OrderCalculationInput } from "./calculate-order";

// Two beers at 1290 plus one cocktail 2490 with a 300 surcharge: subtotal 5370.
const baseInput: OrderCalculationInput = {
  items: [
    { priceHuf: 1290, optionsHuf: 0, quantity: 2 },
    { priceHuf: 2490, optionsHuf: 300, quantity: 1 },
  ],
  serviceFee: { type: "none" },
  promo: null,
  tip: { type: "percent", bps: 0 },
  smsRequested: false,
  commissionBps: 100,
};

describe("calculateOrder", () => {
  it("prices a plain cart with the pilot 1% commission", () => {
    const result = calculateOrder(baseInput);

    expect(result).toEqual({
      subtotalHuf: 5370,
      discountHuf: 0,
      serviceFeeHuf: 0,
      tipHuf: 0,
      totalHuf: 5370,
      commissionHuf: 54, // 53.7
      applicationFeeHuf: 54,
      stripeAmount: 537_000,
      stripeApplicationFeeAmount: 5_400,
      paymentMode: "stripe",
    });
  });

  it.each([
    [0, 0],
    [500, 269], // 268.5 rounds half up
    [1000, 537],
    [1500, 806], // 805.5
  ])(
    "adds a %s bps tip of %s Ft on the discounted subtotal",
    (tipBps, tipHuf) => {
      const result = calculateOrder({
        ...baseInput,
        tip: { type: "percent", bps: tipBps },
      });

      expect(result.tipHuf).toBe(tipHuf);
      expect(result.totalHuf).toBe(5370 + tipHuf);
    },
  );

  it("takes a custom tip as is", () => {
    const result = calculateOrder({
      ...baseInput,
      tip: { type: "custom", amountHuf: 630 },
    });

    expect(result.tipHuf).toBe(630);
    expect(result.totalHuf).toBe(6000);
  });

  it.each([
    [{ type: "percent", value: 1250 } as const, 671], // 12.5% of 5370 = 671.25
    [{ type: "fixed", value: 400 } as const, 400],
  ])("adds the %o service fee", (serviceFee, serviceFeeHuf) => {
    const result = calculateOrder({ ...baseInput, serviceFee });

    expect(result.serviceFeeHuf).toBe(serviceFeeHuf);
  });

  it.each([
    [{ type: "percent", value: 2000 } as const, 1074],
    [{ type: "fixed", value: 1000 } as const, 1000],
    [{ type: "fixed", value: 99_999 } as const, 5370],
  ])("applies the %o promo, capped at the subtotal", (promo, discountHuf) => {
    const result = calculateOrder({ ...baseInput, promo });

    expect(result.discountHuf).toBe(discountHuf);
  });

  it("bases service fee and tip on the discounted subtotal", () => {
    const result = calculateOrder({
      ...baseInput,
      promo: { type: "fixed", value: 370 },
      serviceFee: { type: "percent", value: 1000 },
      tip: { type: "percent", bps: 1000 },
    });

    expect(result.serviceFeeHuf).toBe(500);
    expect(result.tipHuf).toBe(500);
    expect(result.totalHuf).toBe(6000);
  });

  it("excludes the tip but includes the service fee in the commission base", () => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf: 10_000, optionsHuf: 0, quantity: 1 }],
      serviceFee: { type: "fixed", value: 1000 },
      tip: { type: "custom", amountHuf: 5000 },
      commissionBps: 300,
    });

    expect(result.commissionHuf).toBe(330);
  });

  it.each([
    [false, 54],
    [true, 89],
  ])(
    "adds the SMS fee to the application fee when sms is %s",
    (smsRequested, fee) => {
      const result = calculateOrder({ ...baseInput, smsRequested });

      expect(result.applicationFeeHuf).toBe(fee);
      expect(result.commissionHuf).toBe(54);
    },
  );

  it("charges the 3% standard commission", () => {
    const result = calculateOrder({ ...baseInput, commissionBps: 300 });

    expect(result.commissionHuf).toBe(161); // 161.1
  });

  it("drops fee and tip and needs no PaymentIntent for a 100% discount", () => {
    const result = calculateOrder({
      ...baseInput,
      promo: { type: "percent", value: 10_000 },
      serviceFee: { type: "fixed", value: 300 },
      tip: { type: "custom", amountHuf: 500 },
    });

    expect(result.serviceFeeHuf).toBe(0);
    expect(result.tipHuf).toBe(0);
    expect(result.totalHuf).toBe(0);
    expect(result.applicationFeeHuf).toBe(0);
    expect(result.paymentMode).toBe("none");
  });

  it("caps the application fee at the total", () => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf: 175, optionsHuf: 0, quantity: 1 }],
      smsRequested: true,
      commissionBps: 10_000,
    });

    expect(result.commissionHuf).toBe(175);
    expect(result.applicationFeeHuf).toBe(175);
  });

  it.each([
    [50, 1], // 0.5 rounds half up
    [150, 2], // 1.5
  ])("rounds a 1%% commission on %s Ft to %s Ft", (priceHuf, commissionHuf) => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf, optionsHuf: 0, quantity: 1 }],
    });

    expect(result.commissionHuf).toBe(commissionHuf);
  });

  it("rounds a percent discount half up", () => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf: 1005, optionsHuf: 0, quantity: 1 }],
      promo: { type: "percent", value: 1000 },
    });

    expect(result.discountHuf).toBe(101); // 100.5
  });

  it("accepts a total of exactly 999 999 Ft", () => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf: 999_999, optionsHuf: 0, quantity: 1 }],
    });

    expect(result.stripeAmount).toBe(99_999_900);
  });

  it.each([
    [174, "belowMinimum"],
    [175, "stripe"],
  ] as const)("marks a %s Ft total as %s", (priceHuf, paymentMode) => {
    const result = calculateOrder({
      ...baseInput,
      items: [{ priceHuf, optionsHuf: 0, quantity: 1 }],
    });

    expect(result.paymentMode).toBe(paymentMode);
  });

  it.each([
    [
      "a fractional price",
      { items: [{ priceHuf: 12.5, optionsHuf: 0, quantity: 1 }] },
    ],
    [
      "a negative surcharge",
      { items: [{ priceHuf: 100, optionsHuf: -1, quantity: 1 }] },
    ],
    [
      "a zero quantity",
      { items: [{ priceHuf: 100, optionsHuf: 0, quantity: 0 }] },
    ],
    ["a promo over 100%", { promo: { type: "percent", value: 10_001 } }],
    ["a fractional commission", { commissionBps: 1.5 }],
    ["a negative custom tip", { tip: { type: "custom", amountHuf: -10 } }],
    ["an empty cart", { items: [] }],
    [
      "a quantity of 1.5",
      { items: [{ priceHuf: 100, optionsHuf: 0, quantity: 1.5 }] },
    ],
    [
      "a NaN price",
      { items: [{ priceHuf: Number.NaN, optionsHuf: 0, quantity: 1 }] },
    ],
    ["a negative fixed promo", { promo: { type: "fixed", value: -1 } }],
    ["an unknown promo type", { promo: { type: "pct", value: 1500 } }],
    [
      "a negative fixed service fee",
      { serviceFee: { type: "fixed", value: -1 } },
    ],
    [
      "an unknown service fee type",
      { serviceFee: { type: "percentage", value: 1000 } },
    ],
    ["a tip of 7%", { tip: { type: "percent", bps: 700 } }],
    [
      "a custom tip above the subtotal",
      { tip: { type: "custom", amountHuf: 5371 } },
    ],
    [
      "a total above 999 999 Ft",
      { items: [{ priceHuf: 1_000_000, optionsHuf: 0, quantity: 1 }] },
    ],
    [
      "SMS below the Stripe minimum",
      {
        items: [{ priceHuf: 174, optionsHuf: 0, quantity: 1 }],
        smsRequested: true,
      },
    ],
    [
      "SMS on a free order",
      { promo: { type: "percent", value: 10_000 }, smsRequested: true },
    ],
  ] as const)("rejects %s", (_name, override) => {
    // Casts let the table reach runtime-only states such as unknown types from the database.
    const act = () =>
      calculateOrder({
        ...baseInput,
        ...override,
      } as unknown as OrderCalculationInput);

    expect(act).toThrow(RangeError);
  });

  it("keeps the invariants for random carts", () => {
    const rate = fc.integer({ min: 0, max: 10_000 });
    const input = fc.record({
      items: fc.array(
        fc.record({
          priceHuf: fc.integer({ min: 0, max: 50_000 }),
          optionsHuf: fc.integer({ min: 0, max: 5_000 }),
          quantity: fc.integer({ min: 1, max: 10 }),
        }),
        { minLength: 1, maxLength: 20 },
      ),
      serviceFee: fc.oneof(
        fc.constant({ type: "none" as const }),
        rate.map((value) => ({ type: "percent" as const, value })),
        fc.nat(5_000).map((value) => ({ type: "fixed" as const, value })),
      ),
      promo: fc.option(
        fc.oneof(
          rate.map((value) => ({ type: "percent" as const, value })),
          fc.nat(100_000).map((value) => ({ type: "fixed" as const, value })),
        ),
        { nil: null },
      ),
      tip: fc.oneof(
        fc
          .constantFrom(0, 500, 1000, 1500)
          .map((bps) => ({ type: "percent" as const, bps })),
        fc
          .nat(20_000)
          .map((amountHuf) => ({ type: "custom" as const, amountHuf })),
      ),
      smsRequested: fc.boolean(),
      commissionBps: fc.integer({ min: 0, max: 10_000 }),
    });

    fc.assert(
      fc.property(input, (order) => {
        let r;
        try {
          r = calculateOrder(order);
        } catch (error) {
          // Only the documented business limits may reject a well-formed cart.
          expect(String(error)).toMatch(
            /tip\.amountHuf|total must not exceed|smsRequested/,
          );
          return;
        }
        const amounts = [
          r.subtotalHuf,
          r.discountHuf,
          r.serviceFeeHuf,
          r.tipHuf,
          r.totalHuf,
          r.commissionHuf,
          r.applicationFeeHuf,
        ];

        expect(amounts.every((a) => Number.isSafeInteger(a) && a >= 0)).toBe(
          true,
        );
        expect(r.totalHuf).toBe(
          r.subtotalHuf - r.discountHuf + r.serviceFeeHuf + r.tipHuf,
        );
        expect(r.discountHuf).toBeLessThanOrEqual(r.subtotalHuf);
        expect(r.applicationFeeHuf).toBeLessThanOrEqual(r.totalHuf);
        expect(r.stripeAmount).toBe(r.totalHuf * 100);
        expect(r.stripeApplicationFeeAmount).toBe(r.applicationFeeHuf * 100);
        expect(r.commissionHuf).toBe(
          Math.round(((r.totalHuf - r.tipHuf) * order.commissionBps) / 10_000),
        );
        expect(r.applicationFeeHuf).toBe(
          Math.min(r.totalHuf, r.commissionHuf + (order.smsRequested ? 35 : 0)),
        );
        expect(r.paymentMode).toBe(
          r.totalHuf === 0
            ? "none"
            : r.totalHuf < 175
              ? "belowMinimum"
              : "stripe",
        );
      }),
      { seed: 42, numRuns: 500 },
    );
  });
});
