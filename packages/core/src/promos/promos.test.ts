import {
  AuditLog,
  Bar,
  connectDb,
  FeeRule,
  Item,
  Order,
  Payment,
  Promo,
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
const { createPromo, listPromos, setPromoActive, validatePromo } =
  await import("./promos");
const { Venue } = await import("@namitiszunk/db");

const now = new Date("2026-11-07T22:00:00Z");
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
    ...overrides,
  };
}

const create = (overrides: Partial<CreateOrderInput> = {}) =>
  createOrder(input(overrides), {
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
    ["a stopped code", { isActive: false }, "NYAR", "promo_stopped"],
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

  it("stores the promo and its discount on the order and takes one use", async () => {
    const { _id } = await promo({ maxUses: 5 });

    const { orderId } = await create({ promoCode: "nyar" });

    const order = await Order.findById(orderId).lean();
    expect(order).toMatchObject({ discountHuf: 500, totalHuf: 2080 });
    expect(String(order!.promoId)).toBe(String(_id));
    expect(await usedCount()).toBe(1);
  });

  it("gives exactly one of two parallel orders the last use of a code", async () => {
    await promo({ maxUses: 1 });

    const results = await Promise.allSettled([
      create({ promoCode: "NYAR" }),
      create({ promoCode: "NYAR" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected");
    expect(refused?.reason).toMatchObject({ code: "promo_used_up" });
    expect(await Order.countDocuments({ discountHuf: { $gt: 0 } })).toBe(1);
    expect(await usedCount()).toBe(1);
  });

  it("releases the use when the payment times out, and only once", async () => {
    await promo({ maxUses: 1 });
    const { orderId } = await create({ promoCode: "NYAR" });
    const system: Actor = { kind: "system", source: "inngest" };

    await transition(orderId, "payment_timeout", system);
    await expect(
      transition(orderId, "payment_timeout", system),
    ).rejects.toThrow();

    expect(await usedCount()).toBe(0);
    await expect(create({ promoCode: "NYAR" })).resolves.toMatchObject({
      orderId: expect.any(String),
    });
  });

  it("keeps the use when the order is paid", async () => {
    await promo({ maxUses: 1 });
    const { orderId } = await create({ promoCode: "NYAR" });

    await transition(orderId, "payment_succeeded", {
      kind: "system",
      source: "stripe",
    });

    expect(await usedCount()).toBe(1);
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
    await expect(stopped).rejects.toMatchObject({ code: "promo_stopped" });
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
      usedCount: 3,
      paidOrders: 2,
      totalDiscountHuf: 1000,
      averageBasketHuf: 3225, // (2580 + 3870) / 2
      isExpired: false,
    });
  });
});
