import "server-only";

import { randomInt } from "node:crypto";

import {
  Bar,
  FeeRule,
  Item,
  type ItemDoc,
  Order,
  Payment,
  Venue,
  Zone,
} from "@namitiszunk/db";
import {
  CURRENT_TERMS_VERSION,
  type CreateOrderInput,
} from "@namitiszunk/validators";
import type { Types } from "mongoose";

import {
  DEFAULT_MAX_ITEMS_PER_ORDER,
  validateSelection,
} from "../cart/selection";
import { openingState } from "../menu/opening-hours";
import { publicModifierGroups } from "../menu/public-menu";
import { businessDate } from "../orders/business-date";
import { applicationFeeOf, calculateOrder } from "../pricing/calculate-order";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { assertVenueCanCharge } from "./connect";
import { stripe } from "./stripe-client";

export type CreateOrderOptions = {
  /** Hash of the guest token the caller hands to the guest (@namitiszunk/auth createGuestToken). */
  guestTokenHash: string;
  /** The signed-in guest's account (T-047); the order then shows in their history. */
  userId?: string;
  /** Runs once the order is stored and before the PaymentIntent exists: starts the payment timeout (T-035). */
  onOrderCreated: (order: {
    orderId: string;
    venueId: string;
  }) => Promise<void>;
  now?: Date;
};

export type CreatedOrder = { orderId: string; clientSecret: string | null };

type CartToPrice = Pick<
  CreateOrderInput,
  "barId" | "zoneId" | "items" | "tip" | "promoCode" | "smsRequested"
>;

const PICKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// shortcut: no spec for the pickup code yet; 3 unambiguous characters like the fixtures (K7Q). T-043 decides the final format.
function pickupCode(): string {
  return Array.from(
    { length: 3 },
    () => PICKUP_ALPHABET[randomInt(PICKUP_ALPHABET.length)],
  ).join("");
}

const invalid = (fields: Record<string, string>) =>
  new AppError(400, "validation_failed", fields);

/** The FeeRule in force now: the venue's newest, else the platform default. */
async function commissionBpsAt(
  venueId: Types.ObjectId,
  now: Date,
): Promise<number> {
  for (const scope of [{ $eq: venueId }, { $exists: false }]) {
    const rule = await FeeRule.findOne({
      venueId: scope,
      validFrom: { $lte: now },
    })
      .sort({ validFrom: -1 })
      .select("commissionBps")
      .lean();
    if (rule) return rule.commissionBps;
  }
  throw new Error("no FeeRule in force: seed the platform default");
}

/** The chosen options of one line, or a 400 when they break the item's groups. */
function chosenOptions(
  stored: ItemDoc["modifierGroups"] | undefined,
  modifierIds: readonly string[],
  path: string,
) {
  const groups = publicModifierGroups(stored, "hu");
  if (validateSelection(groups, modifierIds).length > 0) {
    throw invalid({ [path]: "invalid" });
  }
  return groups.flatMap((group) =>
    group.modifiers
      .filter((m) => modifierIds.includes(m.id))
      .map((m) => ({
        groupName: group.name,
        name: m.name,
        priceDeltaHuf: m.priceDeltaHuf,
      })),
  );
}

/**
 * The server's re-check and price of a cart (T-033, T-042): bar open and not paused, venue able to charge,
 * items sellable here, options valid, rules met. Shared by the checkout quote and order creation.
 */
async function priceCart(input: CartToPrice, now: Date) {
  const bar = await Bar.findById(input.barId)
    .select("venueId isOpen pausedUntil")
    .lean();
  if (!bar) throw new NotFoundError();
  const venue = await Venue.findById(bar.venueId)
    .select(
      "status timezone businessDayStart openingHours stripeAccountId chargesEnabled orderRules ordersPausedAt",
    )
    .lean();
  if (!venue) throw new NotFoundError();
  if (venue.status !== "active") throw new ConflictError("venue_closed");
  const hours = openingState(
    venue.openingHours ?? undefined,
    venue.orderRules?.lastOrderMinutesBeforeClose,
    venue.timezone,
    now,
  );
  // Outside opening hours or after the last order reads as a closed bar to the guest.
  if (!bar.isOpen || !hours.orderable) throw new ConflictError("bar_closed");
  if (venue.ordersPausedAt) throw new ConflictError("orders_paused");
  if (bar.pausedUntil && bar.pausedUntil > now) {
    throw new ConflictError("bar_paused");
  }
  assertVenueCanCharge(venue);

  let isVip = false;
  if (input.zoneId) {
    const zone = await Zone.findOne({ _id: input.zoneId, barId: bar._id })
      .select("type")
      .lean();
    if (!zone) throw invalid({ zoneId: "invalid" });
    isVip = zone.type === "vip_table";
  }

  const rules = venue.orderRules;
  const quantity = input.items.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity > (rules?.maxItemsPerOrder ?? DEFAULT_MAX_ITEMS_PER_ORDER)) {
    throw new ConflictError("too_many_items");
  }
  // shortcut: promo codes arrive with T-060 (packages/core/src/promos); until then a code is refused, never silently ignored.
  if (input.promoCode) throw new ConflictError("promo_invalid");

  // Stock is re-read here, right before the PaymentIntent: a sold-out item never gets charged.
  const items = await Item.find({
    _id: { $in: input.items.map((line) => line.itemId) },
    venueId: venue._id,
  })
    .select(
      "name nameEn priceHuf isAvailable archivedAt vipOnly barIds modifierGroups",
    )
    .lean();
  const byId = new Map(items.map((item) => [String(item._id), item]));
  const unavailable: Record<string, string> = {};
  input.items.forEach((line, index) => {
    const item = byId.get(line.itemId);
    const sellable =
      item &&
      item.isAvailable !== false &&
      !item.archivedAt &&
      (!item.vipOnly || isVip) &&
      (!item.barIds?.length ||
        item.barIds.some((id) => String(id) === String(bar._id)));
    if (!sellable) unavailable[`items.${index}.itemId`] = "unavailable";
  });
  if (Object.keys(unavailable).length > 0) {
    throw new AppError(409, "items_unavailable", unavailable);
  }

  const lines = input.items.map((line, index) => {
    const item = byId.get(line.itemId)!;
    const opts = chosenOptions(
      item.modifierGroups,
      line.modifierIds ?? [],
      `items.${index}.modifierIds`,
    );
    const optionsHuf = opts.reduce((sum, o) => sum + o.priceDeltaHuf, 0);
    return {
      itemId: item._id,
      name: item.name,
      nameEn: item.nameEn ?? undefined,
      unitPriceHuf: item.priceHuf,
      quantity: line.quantity,
      options: opts,
      lineTotalHuf: (item.priceHuf + optionsHuf) * line.quantity,
    };
  });

  let calc;
  try {
    calc = calculateOrder({
      items: lines.map((l) => ({
        priceHuf: l.unitPriceHuf,
        optionsHuf: l.options.reduce((sum, o) => sum + o.priceDeltaHuf, 0),
        quantity: l.quantity,
      })),
      serviceFee:
        rules?.serviceFee?.type === "percent" ||
        rules?.serviceFee?.type === "fixed"
          ? { type: rules.serviceFee.type, value: rules.serviceFee.value ?? 0 }
          : { type: "none" },
      promo: null,
      tip: input.tip,
      // A venue without its own presets (or before T-058) prices with the defaults.
      tips: rules?.tips?.presetsBps?.length
        ? {
            enabled: rules.tips.enabled !== false,
            presetsBps: rules.tips.presetsBps,
          }
        : rules?.tips?.enabled === false
          ? { enabled: false, presetsBps: [] }
          : undefined,
      smsRequested: input.smsRequested,
      commissionBps: await commissionBpsAt(venue._id, now),
    });
  } catch (error) {
    // A custom tip above the subtotal, SMS on an unpayable order, a total over Stripe's ceiling.
    if (error instanceof RangeError) throw invalid({});
    throw error;
  }
  if (calc.subtotalHuf < (rules?.minimumOrderHuf ?? 0)) {
    throw new ConflictError("below_minimum_order");
  }
  if (calc.paymentMode === "belowMinimum") {
    throw new ConflictError("below_minimum_charge");
  }
  // shortcut: only a 100% promo makes a free order, and promos are refused until T-060, which decides how a free order reaches New without a webhook.
  if (calc.paymentMode === "none") throw new ConflictError("nothing_to_charge");

  return { bar, venue, isVip, lines, calc };
}

/**
 * POST /v1/orders (T-033): re-checks the bar and the cart on the server, prices it (T-022), stores the
 * order "awaiting payment" and creates its PaymentIntent on the venue's connected account (direct charge).
 * The order becomes New only through the payment_intent.succeeded webhook.
 */
export async function createOrder(
  input: CreateOrderInput,
  options: CreateOrderOptions,
): Promise<CreatedOrder> {
  const now = options.now ?? new Date();
  // The order must record the terms the guest saw; a stale checkout tab reloads them first.
  if (input.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
    throw new ConflictError("terms_outdated");
  }
  const { bar, venue, isVip, lines, calc } = await priceCart(input, now);

  const date = businessDate(now, {
    timezone: venue.timezone ?? "Europe/Budapest",
    businessDayStart: venue.businessDayStart ?? "06:00",
  });
  const session = await Order.startSession();
  let orderId = "";
  try {
    await session.withTransaction(async () => {
      const [order] = await Order.create(
        [
          {
            venueId: venue._id,
            barId: bar._id,
            zoneId: input.zoneId,
            // Provisional: payment sets the final business day with the short number (T-024).
            businessDate: date,
            items: lines,
            subtotalHuf: calc.subtotalHuf,
            serviceFeeHuf: calc.serviceFeeHuf,
            tipHuf: calc.tipHuf,
            discountHuf: calc.discountHuf,
            totalHuf: calc.totalHuf,
            pickupCode: pickupCode(),
            guestTokenHash: options.guestTokenHash,
            ...(options.userId ? { userId: options.userId } : {}),
            guestPhone: input.guestPhone,
            smsRequested: input.smsRequested,
            isVip,
            acceptedTermsVersion: input.acceptedTermsVersion,
          },
        ],
        { session },
      );
      orderId = String(order!._id);
    });
  } finally {
    await session.endSession();
  }

  const venueId = String(venue._id);
  // Before Stripe: an order whose timeout cannot start must never get a PaymentIntent.
  await options.onOrderCreated({ orderId, venueId });

  const clientSecret = await openPaymentIntent({
    orderId,
    venueId: venue._id,
    stripeAccountId: venue.stripeAccountId!,
    totalHuf: calc.totalHuf,
    applicationFeeHuf: calc.applicationFeeHuf,
    posthogId: input.posthogId,
  });
  return { orderId, clientSecret };
}

export type OrderQuote = {
  lines: {
    name: string;
    nameEn?: string;
    options: string[];
    quantity: number;
    lineTotalHuf: number;
  }[];
  subtotalHuf: number;
  discountHuf: number;
  serviceFeeHuf: number;
  tipHuf: number;
  totalHuf: number;
  /** The venue's connected account: the checkout's Stripe.js charges on it (direct charge). */
  stripeAccountId: string;
  /** The terms version the guest accepts; createOrder takes no other. */
  termsVersion: string;
};

/**
 * POST /v1/orders/quote (T-042): the checkout summary, priced by the server exactly as createOrder will
 * price it, with the same refusals (paused bar, sold-out item). Nothing is stored.
 */
export async function quoteOrder(
  input: CartToPrice,
  now: Date = new Date(),
): Promise<OrderQuote> {
  const { venue, lines, calc } = await priceCart(input, now);
  return {
    lines: lines.map((line) => ({
      name: line.name,
      ...(line.nameEn ? { nameEn: line.nameEn } : {}),
      options: line.options.map((o) => o.name),
      quantity: line.quantity,
      lineTotalHuf: line.lineTotalHuf,
    })),
    subtotalHuf: calc.subtotalHuf,
    discountHuf: calc.discountHuf,
    serviceFeeHuf: calc.serviceFeeHuf,
    tipHuf: calc.tipHuf,
    totalHuf: calc.totalHuf,
    stripeAccountId: venue.stripeAccountId!,
    termsVersion: CURRENT_TERMS_VERSION,
  };
}

/**
 * The order's one PaymentIntent and its Payment. The idempotency key makes Stripe return the same
 * intent for the same order, so the replay after a crash between the two recreates nothing.
 */
async function openPaymentIntent(order: {
  orderId: string;
  venueId: Types.ObjectId;
  stripeAccountId: string;
  totalHuf: number;
  applicationFeeHuf: number;
  posthogId?: string;
}): Promise<string | null> {
  const venueId = String(order.venueId);
  const intent = await stripe().paymentIntents.create(
    {
      amount: order.totalHuf * 100,
      currency: "huf",
      application_fee_amount: order.applicationFeeHuf * 100,
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: order.orderId,
        venueId,
        ...(order.posthogId ? { posthogId: order.posthogId } : {}),
      },
    },
    // One PaymentIntent per order, however often this runs for it.
    {
      stripeAccount: order.stripeAccountId,
      idempotencyKey: `order-${order.orderId}-payment-intent`,
    },
  );
  await Payment.updateOne(
    { stripePaymentIntentId: intent.id },
    {
      $setOnInsert: {
        venueId: order.venueId,
        orderId: order.orderId,
        amountHuf: order.totalHuf,
        applicationFeeHuf: order.applicationFeeHuf,
      },
    },
    { upsert: true },
  );
  return intent.client_secret;
}

/**
 * An idempotent replay of order creation. While the order awaits payment it gets a new guest token
 * (the raw one was never stored; the previous one stops working) and the PaymentIntent's client
 * secret again. Once paid or closed it answers with the order id only: the first tab keeps its token.
 */
export async function reissueOrderPayment(
  orderId: string,
  guestTokenHash: string,
  posthogId?: string,
): Promise<CreatedOrder | { orderId: string }> {
  // Only the token changes; the status is the filter, so a paid order keeps its first token.
  const awaitingPayment = { _id: orderId, status: "awaiting_payment" as const };
  const order = await Order.findOneAndUpdate(awaitingPayment, {
    $set: { guestTokenHash },
  })
    .select("venueId totalHuf tipHuf smsRequested createdAt")
    .lean();
  if (!order) {
    if (!(await Order.exists({ _id: orderId }))) throw new NotFoundError();
    return { orderId };
  }
  const venue = await Venue.findById(order.venueId)
    .select("stripeAccountId")
    .lean();
  if (!venue?.stripeAccountId) throw new NotFoundError();
  const payment = await Payment.findOne({ orderId })
    .sort({ createdAt: -1 })
    .select("stripePaymentIntentId")
    .lean();
  if (!payment) {
    // A crash between Stripe and Payment.create: the same parameters and key give back the same intent.
    // shortcut: the commission is read at the order's createdAt, not the instant createOrder priced it; a FeeRule starting in between would differ (Stripe then refuses the key).
    const { applicationFeeHuf } = applicationFeeOf({
      totalHuf: order.totalHuf,
      tipHuf: order.tipHuf ?? 0,
      commissionBps: await commissionBpsAt(order.venueId, order.createdAt),
      smsRequested: order.smsRequested ?? false,
    });
    const clientSecret = await openPaymentIntent({
      orderId,
      venueId: order.venueId,
      stripeAccountId: venue.stripeAccountId,
      totalHuf: order.totalHuf,
      applicationFeeHuf,
      posthogId,
    });
    return { orderId, clientSecret };
  }
  const intent = await stripe().paymentIntents.retrieve(
    payment.stripePaymentIntentId,
    {},
    { stripeAccount: venue.stripeAccountId },
  );
  return { orderId, clientSecret: intent.client_secret };
}
