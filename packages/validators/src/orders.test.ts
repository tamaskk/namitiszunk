import { describe, expect, it } from "vitest";

import { createOrderInputSchema, type CreateOrderInput } from "./orders";
import { fieldErrorKeys } from "./shared";

const itemId = "0123456789abcdef01234567";

function order(overrides: Partial<CreateOrderInput> = {}): unknown {
  return {
    barId: "abcdefabcdefabcdefabcdef",
    items: [{ itemId, quantity: 1 }],
    tip: { type: "percent", bps: 0 },
    smsRequested: false,
    acceptedTermsVersion: "2026-11",
    ...overrides,
  };
}

function errorKeys(input: unknown): Record<string, string> {
  const result = createOrderInputSchema.safeParse(input);
  return result.success ? {} : fieldErrorKeys(result.error);
}

describe("createOrderInputSchema", () => {
  it("accepts a minimal valid cart", () => {
    const input = order();

    const result = createOrderInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it("refuses a terms version longer than 32 characters", () => {
    const input = order({ acceptedTermsVersion: "v".repeat(33) });

    const result = createOrderInputSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("accepts quantities 1 and 10 at the boundaries", () => {
    const input = order({
      items: [
        { itemId, quantity: 1 },
        { itemId, quantity: 10 },
      ],
    });

    const result = createOrderInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it("rejects quantity 0 and 11 with translation keys", () => {
    const input = order({
      items: [
        { itemId, quantity: 0 },
        { itemId, quantity: 11 },
      ],
    });

    const keys = errorKeys(input);

    expect(keys).toEqual({
      "items.0.quantity": "validation.quantity.min",
      "items.1.quantity": "validation.quantity.max",
    });
  });

  it("rejects a fractional quantity", () => {
    const input = order({ items: [{ itemId, quantity: 1.5 }] });

    const keys = errorKeys(input);

    expect(keys["items.0.quantity"]).toBe("validation.quantity.integer");
  });

  it("rejects an empty cart", () => {
    const input = order({ items: [] });

    const keys = errorKeys(input);

    expect(keys).toEqual({ items: "validation.cart.empty" });
  });

  it("accepts a Hungarian mobile number and no number at all", () => {
    const withPhone = order({ guestPhone: "+36301234567", smsRequested: true });
    const withoutPhone = order();

    const results = [withPhone, withoutPhone].map(
      (input) => createOrderInputSchema.safeParse(input).success,
    );

    expect(results).toEqual([true, true]);
  });

  it.each(["06301234567", "+3630123", "+43123456789", "+36 30 123 4567"])(
    "rejects the phone number %s",
    (guestPhone) => {
      const input = order({ guestPhone });

      const keys = errorKeys(input);

      expect(keys).toEqual({ guestPhone: "validation.phone.invalid" });
    },
  );

  it("requires a phone number when SMS is requested", () => {
    const input = order({ smsRequested: true });

    const keys = errorKeys(input);

    expect(keys).toEqual({ guestPhone: "validation.phone.requiredForSms" });
  });

  it("accepts preset tips and a custom integer tip", () => {
    const tips = [
      { type: "percent", bps: 1500 },
      { type: "custom", amountHuf: 300 },
    ] as const;

    const results = tips.map(
      (tip) => createOrderInputSchema.safeParse(order({ tip })).success,
    );

    expect(results).toEqual([true, true]);
  });

  it("rejects a non-preset percent tip and a fractional custom tip", () => {
    const percent = { tip: { type: "percent", bps: 700 } };
    const custom = { tip: { type: "custom", amountHuf: 99.5 } };

    const keys = [percent, custom].map((tip) => errorKeys(order(tip as never)));

    expect(keys).toEqual([
      { "tip.bps": "validation.tip.preset" },
      { "tip.amountHuf": "validation.huf.integer" },
    ]);
  });

  it("maps Zod's own messages to validation.<code> keys", () => {
    const input = order({ barId: 42 as never });

    const keys = errorKeys(input);

    expect(keys).toEqual({ barId: "validation.invalid_type" });
  });
});
