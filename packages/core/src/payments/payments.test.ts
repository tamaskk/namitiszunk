import {
  AuditLog,
  Bar,
  connectDb,
  Counter,
  FeeRule,
  Item,
  Order,
  Payment,
  Refund,
  StripeEvent,
  Venue,
} from "@namitiszunk/db";
import {
  CURRENT_TERMS_VERSION,
  type CreateOrderInput,
} from "@namitiszunk/validators";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { calculateOrder, subtotalOf } from "../pricing/calculate-order";
import { setDefaultErrorReporter } from "../report-error";

vi.mock("server-only", () => ({}));
// Stripe and Ably are the boundaries; signatures use the real SDK.
const api = vi.hoisted(() => ({
  paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
  charges: { retrieve: vi.fn() },
  refunds: { create: vi.fn() },
}));
vi.mock("./stripe-client", () => ({ stripe: () => api }));
vi.mock("ably", () => ({
  Rest: class {
    channels = { get: () => ({ publish: async () => {} }) };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

const { createOrder, quoteOrder, reissueOrderPayment } =
  await import("./create-order");
const { processConnectWebhook } = await import("./connect");

const secret = "whsec_test_secret";
const accountId = "acct_1TestVenue";
const now = new Date("2026-11-07T22:00:00Z");
const venueId = new Types.ObjectId();
const barId = new Types.ObjectId();
const ginId = new Types.ObjectId();
const beerId = new Types.ObjectId();
const limeId = new Types.ObjectId();
const reported = vi.fn();

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_payments_test"));
  await Promise.all(
    [Order, Payment, Refund, Counter, StripeEvent, AuditLog].map((m) =>
      m.syncIndexes(),
    ),
  );
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  setDefaultErrorReporter(reported);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

let intentSeq = 0;
beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  // Stripe's own idempotency: the same key returns the same PaymentIntent.
  const byKey = new Map<string, object>();
  api.paymentIntents.create.mockImplementation(
    async (params: { amount: number }, opts: { idempotencyKey: string }) => {
      const existing = byKey.get(opts.idempotencyKey);
      if (existing) return existing;
      intentSeq += 1;
      const intent = {
        id: `pi_${intentSeq}`,
        client_secret: `pi_${intentSeq}_secret_x`,
        amount: params.amount,
      };
      byKey.set(opts.idempotencyKey, intent);
      return intent;
    },
  );
  await Venue.create({
    _id: venueId,
    slug: "pilot",
    name: "Pilot Club",
    status: "active",
    stripeAccountId: accountId,
    chargesEnabled: true,
    orderRules: {
      maxItemsPerOrder: 5,
      serviceFee: { type: "percent", value: 1000 },
    },
  });
  await Bar.create({ _id: barId, venueId, name: "Main bar", isOpen: true });
  await Item.create([
    {
      _id: ginId,
      venueId,
      categoryId: new Types.ObjectId(),
      name: "Gin tonic",
      priceHuf: 2490,
      vatRate: 27,
      modifierGroups: [
        {
          name: "Garnish",
          maxSelect: 1,
          modifiers: [{ _id: limeId, name: "Lime", priceDeltaHuf: 100 }],
        },
      ],
    },
    {
      _id: beerId,
      venueId,
      categoryId: new Types.ObjectId(),
      name: "Beer",
      priceHuf: 1290,
      vatRate: 27,
    },
  ]);
  await FeeRule.create([
    { commissionBps: 300, validFrom: new Date("2026-01-01") },
    { venueId, commissionBps: 250, validFrom: new Date("2026-06-01") },
  ]);
});

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    barId: barId.toHexString(),
    items: [
      {
        itemId: ginId.toHexString(),
        quantity: 2,
        modifierIds: [limeId.toHexString()],
      },
      { itemId: beerId.toHexString(), quantity: 1 },
    ],
    tip: { type: "percent", bps: 1000 },
    smsRequested: false,
    acceptedTermsVersion: "draft-2026-11",
    ...overrides,
  };
}

const onOrderCreated = vi.fn(async () => {});
const create = (overrides: Partial<CreateOrderInput> = {}) =>
  createOrder(input(overrides), {
    guestTokenHash: new Types.ObjectId().toHexString().padEnd(64, "0"),
    onOrderCreated,
    now,
  });

/** A fixed payment_intent.* event for the connected account, as the Connect endpoint receives it. */
function intentEvent(
  id: string,
  type: "payment_intent.succeeded" | "payment_intent.payment_failed",
  intent: {
    id: string;
    amount: number;
    orderId: string;
    currency?: string;
    applicationFee?: number;
    latestCharge?: string;
  },
  account = accountId,
) {
  const body = JSON.stringify({
    id,
    object: "event",
    type,
    account,
    api_version: "2026-10-28.endive",
    created: 1_794_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: intent.id,
        object: "payment_intent",
        amount: intent.amount,
        currency: intent.currency ?? "huf",
        application_fee_amount: intent.applicationFee ?? null,
        latest_charge: intent.latestCharge ?? null,
        status:
          type === "payment_intent.succeeded"
            ? "succeeded"
            : "requires_payment_method",
        metadata: { orderId: intent.orderId, venueId: venueId.toHexString() },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });
  return [body, signature] as const;
}

async function paidEvent(id = "evt_paid_1") {
  const { orderId } = await create();
  const payment = await Payment.findOne({ orderId }).lean();
  return {
    orderId,
    event: intentEvent(id, "payment_intent.succeeded", {
      id: payment!.stripePaymentIntentId,
      amount: payment!.amountHuf * 100,
      orderId,
      applicationFee: payment!.applicationFeeHuf * 100,
    }),
  };
}

const status = async (orderId: string) =>
  (await Order.findById(orderId).lean())?.status;

describe("quoteOrder", () => {
  it("prices the cart as createOrder will, names the account and stores nothing", async () => {
    const cart = input();

    const quote = await quoteOrder(cart, now);
    const { orderId } = await create();

    const order = await Order.findById(orderId).lean();
    expect(quote).toMatchObject({
      subtotalHuf: order!.subtotalHuf,
      serviceFeeHuf: order!.serviceFeeHuf,
      tipHuf: order!.tipHuf,
      discountHuf: 0,
      totalHuf: 7764,
      stripeAccountId: accountId,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    expect(quote.lines[0]).toMatchObject({ quantity: 2, options: ["Lime"] });
    expect(api.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it("takes only the venue's own tip presets, and no tip when tips are off (T-058)", async () => {
    await Venue.updateOne(
      { _id: venueId },
      {
        $set: {
          "orderRules.tips": { enabled: true, presetsBps: [800, 1200, 2000] },
        },
      },
    );

    const twelve = await quoteOrder(
      input({ tip: { type: "percent", bps: 1200 } }),
      now,
    );
    const ten = quoteOrder(input({ tip: { type: "percent", bps: 1000 } }), now);

    expect(twelve.tipHuf).toBeGreaterThan(0);
    await expect(ten).rejects.toMatchObject({ status: 400 });
    await Venue.updateOne(
      { _id: venueId },
      { $set: { "orderRules.tips.enabled": false } },
    );
    await expect(
      quoteOrder(input({ tip: { type: "custom", amountHuf: 100 } }), now),
    ).rejects.toMatchObject({ status: 400 });
    const none = await quoteOrder(
      input({ tip: { type: "percent", bps: 0 } }),
      now,
    );
    expect(none.tipHuf).toBe(0);
  });

  it("writes no order and creates no PaymentIntent", async () => {
    await quoteOrder(input(), now);

    expect(await Order.countDocuments()).toBe(0);
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses a paused bar and a sold-out item like createOrder", async () => {
    await Bar.updateOne(
      { _id: barId },
      { $set: { pausedUntil: new Date(now.getTime() + 60_000) } },
    );
    await expect(quoteOrder(input(), now)).rejects.toMatchObject({
      code: "bar_paused",
    });
    await Bar.updateOne({ _id: barId }, { $unset: { pausedUntil: 1 } });
    await Item.updateOne({ _id: beerId }, { $set: { isAvailable: false } });

    const soldOut = quoteOrder(input(), now);

    await expect(soldOut).rejects.toMatchObject({
      status: 409,
      code: "items_unavailable",
    });
  });
});

describe("createOrder", () => {
  it("puts the order in the signed-in guest's history, and leaves it out without an account", async () => {
    const userId = new Types.ObjectId().toHexString();

    const signedIn = await createOrder(input(), {
      guestTokenHash: new Types.ObjectId().toHexString().padEnd(64, "0"),
      userId,
      onOrderCreated,
      now,
    });
    const anonymous = await create();

    expect(
      String((await Order.findById(signedIn.orderId).lean())?.userId),
    ).toBe(userId);
    expect(
      (await Order.findById(anonymous.orderId).lean())?.userId,
    ).toBeUndefined();
  });

  it("prices on the server and creates a direct-charge PaymentIntent with the T-022 application fee", async () => {
    const { orderId, clientSecret } = await create();

    // (2490 + 100) × 2 + 1290 = 6470; fee 10% = 647; tip 10% = 647; commission 2.5% of 7117 = 178.
    const expected = calculateOrder({
      items: [
        { priceHuf: 2490, optionsHuf: 100, quantity: 2 },
        { priceHuf: 1290, optionsHuf: 0, quantity: 1 },
      ],
      serviceFee: { type: "percent", value: 1000 },
      promo: null,
      tip: { type: "percent", bps: 1000 },
      smsRequested: false,
      commissionBps: 250,
    });
    expect(expected.totalHuf).toBe(7764);
    expect(api.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 776_400,
        currency: "huf",
        application_fee_amount: expected.commissionHuf * 100,
        automatic_payment_methods: { enabled: true },
        metadata: { orderId, venueId: venueId.toHexString() },
      },
      {
        stripeAccount: accountId,
        idempotencyKey: `order-${orderId}-payment-intent`,
      },
    );
    expect(clientSecret).toBe("pi_" + intentSeq + "_secret_x");
    const order = await Order.findById(orderId).lean();
    expect(order).toMatchObject({
      status: "awaiting_payment",
      subtotalHuf: 6470,
      serviceFeeHuf: 647,
      tipHuf: 647,
      totalHuf: 7764,
      businessDate: "2026-11-07",
    });
    // Numbered at payment, not at checkout (T-024).
    expect(order?.shortNumber).toBeUndefined();
    expect(order!.items[0]!.options).toMatchObject([
      { groupName: "Garnish", name: "Lime", priceDeltaHuf: 100 },
    ]);
    const payment = await Payment.findOne({ orderId }).lean();
    expect(payment).toMatchObject({
      status: "requires_payment",
      amountHuf: 7764,
      applicationFeeHuf: expected.applicationFeeHuf,
    });
    expect(onOrderCreated).toHaveBeenCalledWith({
      orderId,
      venueId: venueId.toHexString(),
    });
  });

  it("refuses a sold-out item with 409 and the item path, and creates no PaymentIntent", async () => {
    await Item.updateOne({ _id: beerId }, { $set: { isAvailable: false } });

    await expect(create()).rejects.toMatchObject({
      status: 409,
      code: "items_unavailable",
      fields: { "items.1.itemId": "unavailable" },
    });

    expect(api.paymentIntents.create).not.toHaveBeenCalled();
    expect(await Order.countDocuments()).toBe(0);
  });

  it("refuses a paused bar, a closed venue and too many items", async () => {
    await Bar.updateOne(
      { _id: barId },
      { $set: { pausedUntil: new Date(now.getTime() + 60_000) } },
    );
    await expect(create()).rejects.toMatchObject({ code: "bar_paused" });
    await Bar.updateOne({ _id: barId }, { $unset: { pausedUntil: 1 } });

    await Venue.updateOne({ _id: venueId }, { $set: { ordersPausedAt: now } });
    await expect(create()).rejects.toMatchObject({ code: "orders_paused" });
    await Venue.updateOne({ _id: venueId }, { $unset: { ordersPausedAt: 1 } });

    await expect(
      create({ items: [{ itemId: beerId.toHexString(), quantity: 6 }] }),
    ).rejects.toMatchObject({ code: "too_many_items" });

    await Venue.updateOne({ _id: venueId }, { $set: { status: "suspended" } });
    await expect(create()).rejects.toMatchObject({ code: "venue_closed" });
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses an order after the venue's last order, and takes one before it", async () => {
    // `now` is Saturday 23:00 in Budapest; the last order is 15 minutes before the close.
    const closingAt = (close: string) =>
      Venue.updateOne(
        { _id: venueId },
        {
          $set: {
            openingHours: [{ day: 6, open: "22:00", close }],
            "orderRules.lastOrderMinutesBeforeClose": 15,
          },
        },
      );

    await closingAt("23:10");
    await expect(create()).rejects.toMatchObject({ code: "bar_closed" });
    await closingAt("04:00");

    await expect(create()).resolves.toMatchObject({
      orderId: expect.any(String),
    });
  });

  it("refuses terms other than the current version with 409 terms_outdated", async () => {
    const stale = create({ acceptedTermsVersion: "2026-11-01" });

    await expect(stale).rejects.toMatchObject({
      status: 409,
      code: "terms_outdated",
    });
    expect(await Order.countDocuments()).toBe(0);
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("stores the accepted terms version on the order", async () => {
    const { orderId } = await create();

    const order = await Order.findById(orderId).lean();
    expect(order?.acceptedTermsVersion).toBe(CURRENT_TERMS_VERSION);
  });

  it("adds 35 Ft to the application fee when the guest gives a Hungarian phone for SMS", async () => {
    const { orderId: without } = await create();
    const { orderId: withSms } = await create({
      guestPhone: "+36301234567",
      smsRequested: true,
    });

    const fees = await Promise.all(
      [without, withSms].map(async (orderId) => {
        const payment = await Payment.findOne({ orderId }).lean();
        return payment!.applicationFeeHuf;
      }),
    );
    expect(fees[1]! - fees[0]!).toBe(35);
    expect(api.paymentIntents.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        application_fee_amount: (fees[0]! + 35) * 100,
      }),
      expect.anything(),
    );
    expect((await Order.findById(withSms).lean())?.guestPhone).toBe(
      "+36301234567",
    );
  });

  it("applies the default limit of 10 items when the venue sets none", async () => {
    await Venue.updateOne(
      { _id: venueId },
      { $unset: { "orderRules.maxItemsPerOrder": 1 } },
    );
    const lines = (beers: number) => [
      { itemId: ginId.toHexString(), quantity: 6 },
      { itemId: beerId.toHexString(), quantity: beers },
    ];

    await expect(create({ items: lines(5) })).rejects.toMatchObject({
      code: "too_many_items",
    });
    await expect(create({ items: lines(4) })).resolves.toMatchObject({
      orderId: expect.any(String),
    });
  });

  it("stores the subtotal the cart shows, priced options included", async () => {
    // The cart computes its subtotal on the client with the same function.
    const cartSubtotal = subtotalOf([
      { priceHuf: 2490, optionsHuf: 100, quantity: 2 },
      { priceHuf: 1290, optionsHuf: 0, quantity: 1 },
    ]);

    const { orderId } = await create();

    expect(cartSubtotal).toBe(6470);
    expect((await Order.findById(orderId).lean())?.subtotalHuf).toBe(
      cartSubtotal,
    );
  });

  it("refuses a venue whose connected account cannot charge", async () => {
    await Venue.updateOne(
      { _id: venueId },
      { $set: { chargesEnabled: false } },
    );

    await expect(create()).rejects.toMatchObject({
      code: "payments_not_enabled",
    });
  });

  it("refuses a total below Stripe's HUF minimum", async () => {
    await Item.updateOne({ _id: beerId }, { $set: { priceHuf: 100 } });

    await expect(
      create({
        items: [{ itemId: beerId.toHexString(), quantity: 1 }],
        tip: { type: "percent", bps: 0 },
      }),
    ).rejects.toMatchObject({ code: "below_minimum_charge" });
  });

  it("re-issues a client secret for the same PaymentIntent on replay", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    api.paymentIntents.retrieve.mockResolvedValue({
      id: payment!.stripePaymentIntentId,
      client_secret: "again_secret",
    });

    const replay = await reissueOrderPayment(orderId, "b".repeat(64));

    expect(replay).toEqual({ orderId, clientSecret: "again_secret" });
    expect(api.paymentIntents.create).toHaveBeenCalledTimes(1);
    const order = await Order.findById(orderId)
      .select("+guestTokenHash")
      .lean();
    expect(order!.guestTokenHash).toBe("b".repeat(64));
  });

  it("creates the PaymentIntent again on replay when a crash left no Payment, with the same key and parameters", async () => {
    const { orderId, clientSecret } = await create({ posthogId: "ph_1" });
    await Payment.deleteMany({ orderId });

    const replay = await reissueOrderPayment(orderId, "b".repeat(64), "ph_1");

    expect(api.paymentIntents.create).toHaveBeenCalledTimes(2);
    const [first, again] = api.paymentIntents.create.mock.calls;
    expect(again).toEqual(first);
    expect(replay).toEqual({ orderId, clientSecret });
    expect(await Payment.findOne({ orderId }).lean()).toMatchObject({
      status: "requires_payment",
      amountHuf: 7764,
    });
  });

  it("does not rotate the guest token on replay once the order left awaiting payment", async () => {
    const { orderId } = await create();
    await Order.updateOne({ _id: orderId }, { $set: { status: "new" } });
    const before = await Order.findById(orderId)
      .select("+guestTokenHash")
      .lean();

    const replay = await reissueOrderPayment(orderId, "b".repeat(64));

    expect(replay).toEqual({ orderId });
    const after = await Order.findById(orderId)
      .select("+guestTokenHash")
      .lean();
    expect(after!.guestTokenHash).toBe(before!.guestTokenHash);
    expect(api.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
});

describe("payment_intent webhooks", () => {
  it("leaves the order awaiting payment until the webhook arrives", async () => {
    const { orderId, event } = await paidEvent();
    expect(await status(orderId)).toBe("awaiting_payment");

    await processConnectWebhook(...event);

    expect(await status(orderId)).toBe("new");
    expect((await Order.findById(orderId).lean())?.shortNumber).toBe(1);
    expect((await Payment.findOne({ orderId }).lean())!.status).toBe(
      "succeeded",
    );
  });

  it("gives one Payment update and one transition when the same event arrives three times", async () => {
    const { orderId, event } = await paidEvent();

    for (let i = 0; i < 3; i++) await processConnectWebhook(...event);

    expect(await status(orderId)).toBe("new");
    expect(await Payment.countDocuments({ orderId, status: "succeeded" })).toBe(
      1,
    );
    expect(
      await AuditLog.countDocuments({ action: "order.payment_succeeded" }),
    ).toBe(1);
    expect(await StripeEvent.countDocuments({ eventId: "evt_paid_1" })).toBe(1);
  });

  it("stores the card brand, last 4 digits and wallet from the charge for the confirmation", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    api.charges.retrieve.mockResolvedValueOnce({
      payment_method_details: {
        card: { brand: "visa", last4: "4242", wallet: { type: "apple_pay" } },
      },
    });

    await processConnectWebhook(
      ...intentEvent("evt_card", "payment_intent.succeeded", {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
        applicationFee: payment!.applicationFeeHuf * 100,
        latestCharge: "ch_1",
      }),
    );

    expect(api.charges.retrieve).toHaveBeenCalledWith(
      "ch_1",
      {},
      { stripeAccount: accountId },
    );
    expect(await Payment.findById(payment!._id).lean()).toMatchObject({
      status: "succeeded",
      cardBrand: "visa",
      cardLast4: "4242",
      wallet: "apple_pay",
    });
  });

  it("stores the card fingerprint before the order reaches New, for the guest cancel limit", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    let statusAtFetch: string | undefined;
    api.charges.retrieve.mockImplementationOnce(async () => {
      statusAtFetch = await status(orderId);
      return {
        payment_method_details: {
          card: { brand: "visa", last4: "4242", fingerprint: "fp_card_a" },
        },
      };
    });

    await processConnectWebhook(
      ...intentEvent("evt_fingerprint", "payment_intent.succeeded", {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
        applicationFee: payment!.applicationFeeHuf * 100,
        latestCharge: "ch_3",
      }),
    );

    expect(statusAtFetch).toBe("awaiting_payment");
    expect(
      (await Payment.findById(payment!._id).select("+cardFingerprint").lean())
        ?.cardFingerprint,
    ).toBe("fp_card_a");
    expect(await status(orderId)).toBe("new");
  });

  it("still pays the order when the card details cannot be read", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    api.charges.retrieve.mockRejectedValueOnce(new Error("stripe down"));

    await processConnectWebhook(
      ...intentEvent("evt_card_fail", "payment_intent.succeeded", {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
        applicationFee: payment!.applicationFeeHuf * 100,
        latestCharge: "ch_2",
      }),
    );

    expect(await status(orderId)).toBe("new");
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it("keeps the status on a failed payment, and a later success still pays the order", async () => {
    const { orderId, event } = await paidEvent();
    const payment = await Payment.findOne({ orderId }).lean();
    const failed = intentEvent(
      "evt_failed_1",
      "payment_intent.payment_failed",
      {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
      },
    );

    await processConnectWebhook(...failed);
    expect(await status(orderId)).toBe("awaiting_payment");
    expect((await Payment.findOne({ orderId }).lean())!.status).toBe(
      "requires_payment",
    );

    await processConnectWebhook(...event);
    expect(await status(orderId)).toBe("new");
  });

  it("does not resurrect an order the timeout cancelled: it refunds the late payment in full, once", async () => {
    const { orderId, event } = await paidEvent();
    const { transition } = await import("../orders/transition");
    await transition(orderId, "payment_timeout", {
      kind: "system",
      source: "inngest",
    });
    api.refunds.create.mockResolvedValue({ id: "re_late", status: "pending" });

    await processConnectWebhook(...event);
    await processConnectWebhook(...event);

    expect(await status(orderId)).toBe("cancelled");
    expect((await Payment.findOne({ orderId }).lean())!.status).toBe(
      "succeeded",
    );
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(api.refunds.create.mock.calls[0]![0]).toMatchObject({
      amount: 776_400,
      refund_application_fee: true,
    });
    expect(await Refund.findOne({ orderId }).lean()).toMatchObject({
      amountHuf: 7764,
      reason: "late_payment",
      initiatedBy: { type: "system" },
    });
  });

  it("does not pay the order when the application fee does not match", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();

    await processConnectWebhook(
      ...intentEvent("evt_fee", "payment_intent.succeeded", {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
        applicationFee: 0,
      }),
    );

    expect(await status(orderId)).toBe("awaiting_payment");
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it("acknowledges and reports a PaymentIntent with no Payment whose order does not exist", async () => {
    const event = intentEvent("evt_orphan", "payment_intent.succeeded", {
      id: "pi_orphan",
      amount: 100_000,
      orderId: new Types.ObjectId().toHexString(),
    });

    await expect(processConnectWebhook(...event)).resolves.toBeUndefined();

    expect(await StripeEvent.countDocuments({ eventId: "evt_orphan" })).toBe(1);
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("pi_orphan"),
      }),
    );
  });

  it("asks Stripe to retry a PaymentIntent whose Payment is not stored yet", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    await Payment.deleteMany({ orderId });
    const event = intentEvent("evt_race", "payment_intent.succeeded", {
      id: payment!.stripePaymentIntentId,
      amount: payment!.amountHuf * 100,
      orderId,
    });

    await expect(processConnectWebhook(...event)).rejects.toThrow(/no Payment/);

    expect(await StripeEvent.countDocuments({ eventId: "evt_race" })).toBe(0);
  });

  it("does not pay the order when the amount or the account does not match", async () => {
    const { orderId } = await create();
    const payment = await Payment.findOne({ orderId }).lean();
    const wrongAmount = intentEvent("evt_amount", "payment_intent.succeeded", {
      id: payment!.stripePaymentIntentId,
      amount: 100,
      orderId,
    });
    const wrongAccount = intentEvent(
      "evt_account",
      "payment_intent.succeeded",
      {
        id: payment!.stripePaymentIntentId,
        amount: payment!.amountHuf * 100,
        orderId,
      },
      "acct_1Other",
    );

    await processConnectWebhook(...wrongAmount);
    await processConnectWebhook(...wrongAccount);

    expect(await status(orderId)).toBe("awaiting_payment");
    expect(reported).toHaveBeenCalledTimes(2);
  });

  it("rejects a bad signature before touching anything", async () => {
    const { orderId, event } = await paidEvent();

    await expect(
      processConnectWebhook(event[0], "t=1,v1=bad"),
    ).rejects.toMatchObject({ status: 400, code: "invalid_signature" });

    expect(await status(orderId)).toBe("awaiting_payment");
    expect(await StripeEvent.countDocuments()).toBe(0);
  });
});
