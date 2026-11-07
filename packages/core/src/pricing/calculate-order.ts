import { assertIntegerHuf } from "../money/assert-integer-huf";

/** One cart line: base price plus the summed surcharge of the chosen options, per unit. */
export type PricedItem = {
  priceHuf: number;
  optionsHuf: number;
  quantity: number;
};

/** Rates are basis points (1250 = 12.5%), fixed amounts are forints, as stored in packages/db. */
export type ServiceFeeRule =
  | { type: "none" }
  | { type: "percent"; value: number }
  | { type: "fixed"; value: number };

export type PromoRule = { type: "percent" | "fixed"; value: number };

export type TipChoice =
  { type: "percent"; bps: number } | { type: "custom"; amountHuf: number };

export type OrderCalculationInput = {
  items: readonly PricedItem[];
  serviceFee: ServiceFeeRule;
  promo: PromoRule | null;
  tip: TipChoice;
  smsRequested: boolean;
  /** Commission of the FeeRule in force at payment time (venue-specific, else the platform default). */
  commissionBps: number;
};

/** none: nothing to charge, no PaymentIntent; belowMinimum: checkout must refuse payment. */
export type PaymentMode = "none" | "belowMinimum" | "stripe";

export type OrderCalculation = {
  subtotalHuf: number;
  discountHuf: number;
  serviceFeeHuf: number;
  tipHuf: number;
  totalHuf: number;
  commissionHuf: number;
  applicationFeeHuf: number;
  /** Stripe expects HUF in fillér: forints × 100. */
  stripeAmount: number;
  stripeApplicationFeeAmount: number;
  paymentMode: PaymentMode;
};

export const SMS_FEE_HUF = 35;
/** Stripe's minimum charge in HUF. */
export const STRIPE_MIN_CHARGE_HUF = 175;
/** Stripe's HUF ceiling is 8 digits in fillér (999 999.99 Ft); whole forints keep us under it. */
export const MAX_ORDER_HUF = 999_999;
/** Preset tips the guest can pick; anything else is a custom amount. */
export const TIP_PERCENT_BPS = [0, 500, 1000, 1500] as const;
const FULL_BPS = 10_000;

function unknownType(name: string, value: never): never {
  throw new RangeError(`${name} has unknown type ${JSON.stringify(value)}`);
}

function nonNegativeHuf(value: number, name: string): number {
  if (assertIntegerHuf(value) < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
  return value;
}

function bps(value: number, name: string, max = FULL_BPS): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be an integer between 0 and ${max} bps`);
  }
  return value;
}

function percentOf(baseHuf: number, rateBps: number): number {
  return Math.round((baseHuf * rateBps) / FULL_BPS);
}

/**
 * Prices an order in the fixed order of docs/fejlesztesi-terv.md #22, rounding after every step.
 * Always run on the server from fresh prices; a client-side total is display only.
 */
export function calculateOrder(input: OrderCalculationInput): OrderCalculation {
  if (input.items.length === 0) {
    throw new RangeError("items must not be empty");
  }
  const subtotalHuf = input.items.reduce((sum, item, index) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError(
        `items[${index}].quantity must be a positive integer`,
      );
    }
    const unitHuf =
      nonNegativeHuf(item.priceHuf, `items[${index}].priceHuf`) +
      nonNegativeHuf(item.optionsHuf, `items[${index}].optionsHuf`);
    return sum + unitHuf * item.quantity;
  }, 0);
  assertIntegerHuf(subtotalHuf);

  const discountHuf = Math.min(
    subtotalHuf,
    promoDiscountHuf(input.promo, subtotalHuf),
  );
  const discountedHuf = subtotalHuf - discountHuf;

  // A fully discounted order is free: no fee, no tip, no PaymentIntent.
  const serviceFeeHuf =
    discountedHuf === 0 ? 0 : serviceFeeOf(input.serviceFee, discountedHuf);
  const tipHuf = discountedHuf === 0 ? 0 : tipOf(input.tip, discountedHuf);

  const totalHuf = assertIntegerHuf(discountedHuf + serviceFeeHuf + tipHuf);
  if (totalHuf > MAX_ORDER_HUF) {
    throw new RangeError(`total must not exceed ${MAX_ORDER_HUF} Ft`);
  }

  const paymentMode: PaymentMode =
    totalHuf === 0
      ? "none"
      : totalHuf < STRIPE_MIN_CHARGE_HUF
        ? "belowMinimum"
        : "stripe";
  // The SMS fee rides on the application fee, so an order without a charge cannot pay for it.
  if (input.smsRequested && paymentMode !== "stripe") {
    throw new RangeError("smsRequested needs a payable order");
  }

  // Commission base excludes the tip but includes the service fee.
  const commissionHuf = percentOf(
    totalHuf - tipHuf,
    bps(input.commissionBps, "commissionBps"),
  );
  // Stripe rejects an application fee above the charge.
  const applicationFeeHuf = Math.min(
    totalHuf,
    commissionHuf + (input.smsRequested ? SMS_FEE_HUF : 0),
  );

  return {
    subtotalHuf,
    discountHuf,
    serviceFeeHuf,
    tipHuf,
    totalHuf,
    commissionHuf,
    applicationFeeHuf,
    stripeAmount: totalHuf * 100,
    stripeApplicationFeeAmount: applicationFeeHuf * 100,
    paymentMode,
  };
}

function promoDiscountHuf(
  promo: PromoRule | null,
  subtotalHuf: number,
): number {
  if (promo === null) return 0;
  switch (promo.type) {
    case "percent":
      return percentOf(subtotalHuf, bps(promo.value, "promo.value"));
    case "fixed":
      return nonNegativeHuf(promo.value, "promo.value");
    default:
      return unknownType("promo", promo.type);
  }
}

function serviceFeeOf(rule: ServiceFeeRule, discountedHuf: number): number {
  switch (rule.type) {
    case "none":
      return 0;
    case "percent":
      return percentOf(discountedHuf, bps(rule.value, "serviceFee.value"));
    case "fixed":
      return nonNegativeHuf(rule.value, "serviceFee.value");
    default:
      return unknownType("serviceFee", rule);
  }
}

function tipOf(tip: TipChoice, discountedHuf: number): number {
  switch (tip.type) {
    case "percent":
      if (!(TIP_PERCENT_BPS as readonly number[]).includes(tip.bps)) {
        throw new RangeError(
          `tip.bps must be one of ${TIP_PERCENT_BPS.join(", ")}`,
        );
      }
      return percentOf(discountedHuf, tip.bps);
    case "custom":
      if (nonNegativeHuf(tip.amountHuf, "tip.amountHuf") > discountedHuf) {
        throw new RangeError(
          "tip.amountHuf must not exceed the discounted subtotal",
        );
      }
      return tip.amountHuf;
    default:
      return unknownType("tip", tip);
  }
}
