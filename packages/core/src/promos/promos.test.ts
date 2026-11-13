import {
  AuditLog,
  Bar,
  connectDb,
  FeeRule,
  Item,
  Order,
  Payment,
  Promo,
  RateLimit,
} from "@namitiszunk/db";
import {
  CURRENT_TERMS_VERSION,
  type CreateOrderInput,
} from "@namitiszunk/validators";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import {
  afterAll,
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Actor, VenueRole } from "../auth/permissions";

vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({
  paymentIntents: { create: vi.fn() },
}));
vi.mock("../payments/stripe-client", () => ({ stripe: () => api }));
vi.mock("ably", () => ({
  Rest: class {
    channels = { get: () => ({ publish: async () => {} }) };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

const { createOrder, quoteOrder } = await import("../payments/create-order");
const { transition } = await import("../orders/transition");
const { createPromo, listPromos, releasePromo, setPromoActive, validatePromo } =
  await import("./promos");
const { Venue } = await import("@namitiszunk/db");

const now = new Date("2026-11-07T22:00:00Z");
const PHONE = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER_PHONE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const venueId = new Types.ObjectId();
const barId = new Types.ObjectId();
const beerId = new Types.ObjectId();

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_promos_test"));
  await Promise.all(
    [Order, Payment, Promo, AuditLog].map((m) => m.syncIndexes()),
  );
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
  api.paymentIntents.create.mockImplementation(async () => {
    intentSeq += 1;
    return { id: `pi_${intentSeq}`, client_secret: `pi_${intentSeq}_secret` };
  });
  await Venue.create({
    _id: venueId,
    slug: "pilot",
    name: "Pilot Club",
    status: "active",
    stripeAccountId: "acct_1TestVenue",
    chargesEnabled: true,
  });
  await Bar.create({ _id: barId, venueId, name: "Main bar", isOpen: true });
  await Item.create({
    _id: beerId,
    venueId,
    categoryId: new Types.ObjectId(),
    name: "Beer",
    priceHuf: 1290,
    vatRate: 27,
  });
  await FeeRule.create({
    commissionBps: 300,
    validFrom: new Date("2026-01-01"),
  });
});

const member = (role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [
    {
      venueId: String(venueId),
      memberId: new Types.ObjectId().toString(),
      role,
    },
  ],
});
const owner = member("owner");

const promo = (overrides: Record<string, unknown> = {}) =>
  Promo.create({
    venueId,
    code: "NYAR",
    type: "fixed",
    value: 500,
    ...overrides,
  });

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    barId: barId.toHexString(),
    items: [{ itemId: beerId.toHexString(), quantity: 2 }],
    tip: { type: "percent", bps: 0 },
    smsRequested: false,
    acceptedTermsVersion: CURRENT_TERMS_VERSION,
    deviceId: PHONE,
    ...overrides,
  };
}

// A new device per order, so tests beyond the rate limits never hit the per-device order limit.
const create = (overrides: Partial<CreateOrderInput> = {}) =>
  createOrder(input({ deviceId: crypto.randomUUID(), ...overrides }), {
    guestTokenHash: new Types.ObjectId().toHexString().padEnd(64, "0"),
    onOrderCreated: async () => {},
    now,
  });

const usedCount = async () => (await Promo.findOne().lean())?.usedCount;

describe("validatePromo", () => {
  it("finds a code in any case and returns its rule", async () => {
    await promo({ type: "percent", value: 1000 });

    const result = await validatePromo(venueId, "nyar", 2580, now);

    expect(result).toMatchObject({ type: "percent", value: 1000 });
  });

  it.each([
    ["an unknown code", {}, "OTHER", "promo_invalid"],
    [
      "a code at another venue",
      { venueId: new Types.ObjectId() },
      "NYAR",
      "promo_invalid",
    ],
    [
      "a code that has not started",
      { validFrom: new Date("2026-11-08") },
      "NYAR",
      "promo_invalid",
    ],
    ["a stopped code", { isActive: false }, "NYAR", "promo_invalid"],
    [
      "an expired code",
      { validTo: new Date("2026-11-07T21:00:00Z") },
      "NYAR",
      "promo_expired",
    ],
    [
      "a subtotal below the minimum",
      { minOrderHuf: 3000 },
      "NYAR",
      "promo_below_minimum",
    ],
    ["a used-up code", { maxUses: 2, usedCount: 2 }, "NYAR", "promo_used_up"],
  ])(
    "refuses %s with its translated code",
    async (_, overrides, code, error) => {
      await promo(overrides);

      const act = validatePromo(venueId, code, 2580, now);

      await expect(act).rejects.toMatchObject({ status: 409, code: error });
    },
  );
});

describe("checkout and order creation", () => {
  it("prices the quote with the discount off the subtotal", async () => {
    await promo();

    const quote = await quoteOrder(input({ promoCode: "nyar" }), now);

    expect(quote).toMatchObject({
      subtotalHuf: 2580,
      discountHuf: 500,
      totalHuf: 2080,
    });
    expect(await usedCount()).toBe(0);
  });

  // The cap itself is calculateOrder's (calculate-order.test.ts); a free order has no payment, so it is refused.
  it.each([
    ["a fixed code above the subtotal", { value: 3000 }],
    ["a 100% code", { type: "percent", value: 10_000 }],
    ["a code leaving less than a card can be charged", { value: 2500 }],
  ])("refuses %s with promo_total_too_low", async (_, overrides) => {
    await promo(overrides);

    const act = quoteOrder(input({ promoCode: "NYAR" }), now);

    await expect(act).rejects.toMatchObject({ code: "promo_total_too_low" });
  });

  const paid = (orderId: string) =>
    transition(orderId, "payment_succeeded", {
      kind: "system",
      source: "stripe",
    });

  it("stores the promo and its discount on the order, and takes the use only when it is paid", async () => {
    const { _id } = await promo({ maxUses: 5 });

    const { orderId } = await create({ promoCode: "nyar" });
    const before = await usedCount();
    await paid(orderId);

    const order = await Order.findById(orderId).lean();
    expect(order).toMatchObject({ discountHuf: 500, totalHuf: 2080 });
    expect(String(order!.promoId)).toBe(String(_id));
    expect(before).toBe(0);
    expect(await usedCount()).toBe(1);
  });

  it("lets unpaid orders hold nothing, so orders nobody pays never block a code", async () => {
    await promo({ maxUses: 1 });
    for (let i = 0; i < 20; i += 1) await create({ promoCode: "NYAR" });

    const next = create({ promoCode: "NYAR" });

    await expect(next).resolves.toMatchObject({ orderId: expect.any(String) });
    expect(await usedCount()).toBe(0);
  });

  it("refuses the code at the checkout once paid orders used it up", async () => {
    await promo({ maxUses: 1 });
    await paid((await create({ promoCode: "NYAR" })).orderId);

    const next = create({ promoCode: "NYAR" });

    await expect(next).rejects.toMatchObject({ code: "promo_used_up" });
  });

  it("counts every paid order, even when two paid at once for the last use (accepted overshoot)", async () => {
    await promo({ maxUses: 1 });
    const first = await create({ promoCode: "NYAR" });
    const second = await create({ promoCode: "NYAR" });

    await Promise.all([paid(first.orderId), paid(second.orderId)]);

    expect(await Order.countDocuments({ discountHuf: 500 })).toBe(2);
    expect(await usedCount()).toBe(2);
  });

  it("takes nothing when the payment times out", async () => {
    await promo({ maxUses: 1 });
    const { orderId } = await create({ promoCode: "NYAR" });

    await transition(orderId, "payment_timeout", {
      kind: "system",
      source: "inngest",
    });

    expect(await usedCount()).toBe(0);
  });

  it("gives the use back when the guest cancels the paid order before acceptance, but not on a bar rejection", async () => {
    await Venue.updateOne({ _id: venueId }, { "orderRules.autoAccept": false });
    await promo({ maxUses: 5 });
    const guestTokenHash = "a".repeat(64);
    const { orderId: cancelled } = await createOrder(
      input({ promoCode: "NYAR" }),
      { guestTokenHash, onOrderCreated: async () => {}, now },
    );
    const { orderId: rejected } = await create({ promoCode: "NYAR" });
    await paid(cancelled);
    await paid(rejected);

    await transition(cancelled, "reject", {
      kind: "guest",
      guestId: guestTokenHash,
    });
    await transition(rejected, "reject", member("manager"), {
      reason: "Elfogyott",
    });

    expect(await usedCount()).toBe(1);
  });

  it("never releases below zero", async () => {
    const { _id } = await promo();
    const session = await mongoose.startSession();

    await session.withTransaction(() => releasePromo(_id, session));
    await session.endSession();

    expect(await usedCount()).toBe(0);
  });

  it("leaves every code alone for an order without a promo", async () => {
    await promo({ maxUses: 5, usedCount: 3 });

    const { orderId } = await create();
    await paid(orderId);

    expect(await usedCount()).toBe(3);
    expect((await Order.findById(orderId).lean())?.promoId).toBeUndefined();
  });

  it("finds a code's orders for the statistics from an index", async () => {
    const { _id } = await promo();

    const plan = await Order.find({
      venueId,
      promoId: { $in: [_id] },
      paidAt: { $type: "date" },
    }).explain("queryPlanner");

    expect(JSON.stringify(plan)).toContain('"indexName":"promo_orders"');
  });
});

describe("promo rate limits", () => {
  // The limiter counts in wall-clock windows (600 s and 900 s). Pin the clock 5 minutes into a window
  // of both, in the future so the TTL monitor never drops a counter mid-test, and let it run on.
  beforeEach(() => {
    const period = 1_800_000;
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(
      Math.ceil(Date.now() / period) * period + period + 300_000,
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const order = (
    deviceId: string | undefined,
    clientIp?: string,
    overrides: Partial<CreateOrderInput> = {},
  ) =>
    createOrder(input({ promoCode: "nyar", deviceId, ...overrides }), {
      guestTokenHash: new Types.ObjectId().toHexString().padEnd(64, "0"),
      onOrderCreated: async () => {},
      ...(clientIp ? { clientIp } : {}),
      now,
    });

  it("answers 429 after 10 unknown codes from one device, even for a valid code", async () => {
    await promo();
    for (let i = 0; i < 10; i += 1) {
      await expect(
        quoteOrder(input({ promoCode: `WRONG${i}` }), now, "203.0.113.7"),
      ).rejects.toMatchObject({ code: "promo_invalid" });
    }

    const guess = quoteOrder(input({ promoCode: "NYAR" }), now, "203.0.113.7");
    const neighbour = quoteOrder(
      input({ promoCode: "NYAR", deviceId: OTHER_PHONE }),
      now,
      "203.0.113.7",
    );

    await expect(guess).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    await expect(neighbour).resolves.toMatchObject({ discountHuf: 500 });
  });

  it("stops one address after 50 unknown codes, whatever device id it sends", async () => {
    await promo();
    for (let i = 0; i < 50; i += 1) {
      await quoteOrder(
        input({ promoCode: `WRONG${i}`, deviceId: crypto.randomUUID() }),
        now,
        "203.0.113.7",
      ).catch(() => {});
    }

    const next = quoteOrder(
      input({ promoCode: "NYAR", deviceId: crypto.randomUUID() }),
      now,
      "203.0.113.7",
    );

    await expect(next).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("does not let a refused attempt count against the guests sharing the address", async () => {
    await promo();
    for (let i = 0; i < 15; i += 1) {
      await quoteOrder(
        input({ promoCode: `WRONG${i}` }),
        now,
        "203.0.113.7",
      ).catch(() => {});
    }

    const counts = (await RateLimit.find().lean()).map((d) => d.count);

    // 10 counted for the device and the address; the 5 refused with 429 counted nowhere.
    expect(counts).toEqual([10, 10]);
  });

  it("does not count valid codes, or a real code refused for the cart, as guesses", async () => {
    await promo({ code: "NAGY", minOrderHuf: 99_000 });
    await promo();
    for (let i = 0; i < 12; i += 1) {
      await quoteOrder(input({ promoCode: "NYAR" }), now, "203.0.113.7");
      await expect(
        quoteOrder(input({ promoCode: "NAGY" }), now, "203.0.113.7"),
      ).rejects.toMatchObject({ code: "promo_below_minimum" });
    }

    const wrong = quoteOrder(input({ promoCode: "WRONG" }), now, "203.0.113.7");

    await expect(wrong).rejects.toMatchObject({ code: "promo_invalid" });
  });

  it("refuses a code without a device id, before any count", async () => {
    await promo();

    const [quote, created] = await Promise.allSettled([
      quoteOrder(input({ promoCode: "NYAR", deviceId: undefined }), now),
      order(undefined),
    ]);

    expect(quote).toMatchObject({
      reason: { status: 400, fields: { deviceId: "required" } },
    });
    expect(created).toMatchObject({ reason: { status: 400 } });
    expect(await RateLimit.countDocuments()).toBe(0);
    expect(await usedCount()).toBe(0);
  });
});

describe("admin", () => {
  it("creates a code upper-case, refuses the same code in another case and audits it", async () => {
    await createPromo(owner, String(venueId), {
      code: "nyar10",
      type: "percent",
      value: 1000,
      maxUses: 50,
    });

    const again = createPromo(owner, String(venueId), {
      code: "NYAR10",
      type: "fixed",
      value: 500,
    });

    await expect(again).rejects.toMatchObject({ code: "promo_code_taken" });
    expect(await Promo.findOne().lean()).toMatchObject({ code: "NYAR10" });
    expect(await AuditLog.countDocuments({ action: "promos.created" })).toBe(1);
  });

  it("lets only the owner manage codes", async () => {
    const act = createPromo(member("manager"), String(venueId), {
      code: "NYAR",
      type: "fixed",
      value: 500,
    });

    await expect(act).rejects.toMatchObject({ status: 403 });
  });

  it("stops and restarts a code with an audit entry each", async () => {
    const { _id } = await promo();

    await setPromoActive(owner, String(venueId), String(_id), false);
    const stopped = validatePromo(venueId, "NYAR", 2580, now);
    await expect(stopped).rejects.toMatchObject({ code: "promo_invalid" });
    await setPromoActive(owner, String(venueId), String(_id), true);

    expect(await validatePromo(venueId, "NYAR", 2580, now)).toBeTruthy();
    expect(
      await AuditLog.find({ action: /^promos\./ })
        .sort({ createdAt: 1 })
        .distinct("action"),
    ).toEqual(expect.arrayContaining(["promos.stopped", "promos.restarted"]));
  });

  it("lists uses, total discount and the average basket of paid orders", async () => {
    await promo({ maxUses: 10 });
    const paid = [
      await create({ promoCode: "NYAR" }),
      await create({
        items: [{ itemId: beerId.toHexString(), quantity: 3 }],
        promoCode: "NYAR",
      }),
    ];
    for (const { orderId } of paid) {
      await transition(orderId, "payment_succeeded", {
        kind: "system",
        source: "stripe",
      });
    }
    await create({ promoCode: "NYAR" }); // awaiting payment: not counted

    const [row] = await listPromos(owner, String(venueId), now);

    expect(row).toMatchObject({
      usedCount: 2,
      paidOrders: 2,
      totalDiscountHuf: 1000,
      averageBasketHuf: 3225, // (2580 + 3870) / 2
      isExpired: false,
    });
  });
});
