import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { archiveItem, Category, Item, Order, Payment, QrCode, Venue } from ".";

// Transactions need a replica set; a standalone memory server would not run them.
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri("namitiszunk_test"));
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.syncIndexes()),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

function orderFields(overrides: Record<string, unknown> = {}) {
  return {
    venueId: new Types.ObjectId(),
    barId: new Types.ObjectId(),
    shortNumber: 214,
    businessDate: "2026-11-06",
    items: [
      {
        itemId: new Types.ObjectId(),
        name: "Gin tonic",
        unitPriceHuf: 2490,
        quantity: 2,
        lineTotalHuf: 4980,
      },
    ],
    subtotalHuf: 4980,
    totalHuf: 4980,
    pickupCode: "K7Q",
    guestTokenHash: "hash",
    acceptedTermsVersion: "2026-11-01",
    ...overrides,
  };
}

async function validationError(doc: mongoose.Document) {
  try {
    await doc.validate();
    return undefined;
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) return error;
    throw error;
  }
}

async function createItem() {
  const venueId = new Types.ObjectId();
  const category = await Category.create({ venueId, name: "Koktélok" });
  return Item.create({
    venueId,
    categoryId: category._id,
    name: "Gin tonic",
    priceHuf: 2490,
    vatRate: 27,
  });
}

describe("Order", () => {
  it("rejects a second order with the same number on the same business day", async () => {
    const first = orderFields();
    await Order.create(first);

    const act = Order.create(
      orderFields({ venueId: first.venueId, barId: first.barId }),
    );

    await expect(act).rejects.toThrow(/duplicate key/);
  });

  it("accepts the same number on the next business day", async () => {
    const first = orderFields();
    await Order.create(first);

    const next = await Order.create(
      orderFields({ venueId: first.venueId, businessDate: "2026-11-07" }),
    );

    expect(next.shortNumber).toBe(214);
  });

  it("rejects a fractional forint amount", async () => {
    const order = new Order(orderFields({ totalHuf: 4980.5 }));

    const error = await validationError(order);

    expect(error?.errors.totalHuf?.message).toMatch(/whole number of forints/);
  });

  it("rejects a negative amount and an empty order", async () => {
    const order = new Order(orderFields({ tipHuf: -100, items: [] }));

    const error = await validationError(order);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining(["tipHuf", "items"]),
    );
  });

  it("starts as awaiting payment", async () => {
    const order = await Order.create(orderFields());

    expect(order.status).toBe("awaiting_payment");
  });

  it("serves the bar view query from an index", async () => {
    const fields = orderFields();
    await Order.create(fields);

    const plan = (await Order.find({
      venueId: fields.venueId,
      barId: fields.barId,
      status: { $in: ["new", "preparing", "ready"] },
    })
      .sort({ createdAt: 1 })
      .explain("queryPlanner")) as unknown as Record<string, unknown>;

    expect(JSON.stringify(plan)).toContain("IXSCAN");
    expect(JSON.stringify(plan)).not.toContain("COLLSCAN");
  });
});

describe("unique keys", () => {
  it("rejects a reused Stripe payment intent", async () => {
    const payment = {
      venueId: new Types.ObjectId(),
      orderId: new Types.ObjectId(),
      stripePaymentIntentId: "pi_123",
      amountHuf: 4980,
    };
    await Payment.create(payment);

    const act = Payment.create({ ...payment, orderId: new Types.ObjectId() });

    await expect(act).rejects.toThrow(/duplicate key/);
  });

  it("rejects a reused venue slug and QR code", async () => {
    await Venue.create({ slug: "pilot", name: "Pilot" });
    const qr = { venueId: new Types.ObjectId(), code: "abc123" };
    await QrCode.create(qr);

    const venue = () => Venue.create({ slug: "Pilot", name: "Other" });
    const code = () => QrCode.create(qr);

    await expect(venue()).rejects.toThrow(/duplicate key/);
    await expect(code()).rejects.toThrow(/duplicate key/);
  });
});

describe("Venue", () => {
  it("defaults to the Budapest business day and auto-accept", async () => {
    const venue = await Venue.create({ slug: "pilot", name: "Pilot" });

    expect(venue.timezone).toBe("Europe/Budapest");
    expect(venue.businessDayStart).toBe("06:00");
    expect(venue.orderRules?.autoAccept).toBe(true);
    expect(venue.orderRules?.pickupDeadlineMinutes).toBe(30);
  });

  it("rejects a pickup deadline outside 15 to 60 minutes", async () => {
    const venue = new Venue({
      slug: "pilot",
      name: "Pilot",
      orderRules: { pickupDeadlineMinutes: 90 },
    });

    const error = await validationError(venue);

    expect(error?.errors["orderRules.pickupDeadlineMinutes"]).toBeDefined();
  });
});

describe("Item", () => {
  it("refuses every way of deleting a menu item", async () => {
    const item = await createItem();

    await expect(item.deleteOne()).rejects.toThrow(/archiveItem/);
    await expect(Item.deleteOne({ _id: item._id })).rejects.toThrow(
      /archiveItem/,
    );
    await expect(Item.deleteMany({})).rejects.toThrow(/archiveItem/);
    await expect(Item.findByIdAndDelete(item._id)).rejects.toThrow(
      /archiveItem/,
    );
    await expect(
      Item.bulkWrite([{ deleteOne: { filter: { _id: item._id } } }]),
    ).rejects.toThrow(/archiveItem/);
    expect(await Item.countDocuments()).toBe(1);
  });

  it("archives an item and hides it", async () => {
    const item = await createItem();

    const archived = await archiveItem(item.id);

    const stored = await Item.findById(item._id).lean();
    expect(archived).toBe(true);
    expect(stored?.archivedAt).toBeInstanceOf(Date);
    expect(stored?.isAvailable).toBe(false);
  });
});

describe("transactions", () => {
  it("rolls back every write when one fails", async () => {
    const fields = orderFields();

    const act = mongoose.connection.transaction(async (session) => {
      const [order] = await Order.create([fields], { session });
      await Payment.create(
        [
          {
            venueId: fields.venueId,
            orderId: order?._id,
            stripePaymentIntentId: "pi_rollback",
            amountHuf: 4980.5,
          },
        ],
        { session },
      );
    });

    await expect(act).rejects.toThrow(/whole number of forints/);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it("commits every write together", async () => {
    const fields = orderFields();

    await mongoose.connection.transaction(async (session) => {
      const [order] = await Order.create([fields], { session });
      await Payment.create(
        [
          {
            venueId: fields.venueId,
            orderId: order?._id,
            stripePaymentIntentId: "pi_commit",
            amountHuf: 4980,
          },
        ],
        { session },
      );
    });

    expect(await Order.countDocuments()).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
  });
});
