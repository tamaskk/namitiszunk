import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Item, Order, orderStatuses, Promo, Venue } from "./models";
import { assertSeedableUri, seedDemo, seedId } from "./seed";

let replSet: MongoMemoryReplSet;
// Fixed clock: the business date must not roll over between two runs.
const now = new Date("2026-11-07T22:00:00Z");

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri("namitiszunk_seed_test"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function countsByCollection(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    Object.values(mongoose.connection.collections).map(
      async (c) => [c.collectionName, await c.countDocuments()] as const,
    ),
  );
  return Object.fromEntries(entries);
}

// Whole documents, nested ids included; only write times and the salted PIN hash vary per run.
async function snapshotByCollection(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.values(mongoose.connection.collections).map(async (c) => {
      const docs = await c
        .find({}, { projection: { createdAt: 0, updatedAt: 0, pinHash: 0 } })
        .sort({ _id: 1 })
        .toArray();
      return [c.collectionName, docs] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe("seedDemo", () => {
  it("creates the same document counts when run twice", async () => {
    await seedDemo(now);
    const first = await countsByCollection();

    await seedDemo(now);
    const second = await countsByCollection();

    expect(second).toEqual(first);
    expect(first).toMatchObject({ venues: 1, bars: 2, zones: 5, qrcodes: 5 });
    expect(first.items).toBeGreaterThanOrEqual(40);
  });

  it("produces identical ids on a fresh database every run", async () => {
    await seedDemo(now);
    const first = await snapshotByCollection();
    await mongoose.connection.dropDatabase();

    await seedDemo(now);
    const second = await snapshotByCollection();

    expect(second).toEqual(first);
    expect(
      await Venue.exists({ _id: seedId("venue:demo"), slug: "demo" }),
    ).toBeTruthy();
  });

  it("seeds an order in every status with consistent integer totals", async () => {
    await seedDemo(now);

    const orders = await Order.find().lean();

    expect(new Set(orders.map((o) => o.status))).toEqual(
      new Set(orderStatuses),
    );
    for (const order of orders) {
      const subtotal = order.items.reduce((sum, l) => sum + l.lineTotalHuf, 0);
      expect(order.subtotalHuf).toBe(subtotal);
      expect(order.totalHuf).toBe(
        subtotal + order.serviceFeeHuf + order.tipHuf - order.discountHuf,
      );
    }
    expect(await Item.countDocuments({ vipOnly: true })).toBeGreaterThan(0);
  });

  it("applies promos only to orders that meet their minimum", async () => {
    await seedDemo(now);

    const promoOrders = await Order.find({ promoId: { $exists: true } }).lean();
    const promos = await Promo.find().lean();

    expect(promoOrders.length).toBeGreaterThan(0);
    for (const order of promoOrders) {
      const promo = promos.find((p) => p._id.equals(order.promoId));
      expect(order.subtotalHuf).toBeGreaterThanOrEqual(promo?.minOrderHuf ?? 0);
    }
  });

  it("dates each order by its own time when seeded just after 06:00", async () => {
    const justAfterOpening = new Date("2026-11-07T05:30:00Z"); // 06:30 Budapest (CET)
    const dayStart = new Date("2026-11-07T05:00:00Z");

    await seedDemo(justAfterOpening);

    const orders = await Order.find().lean();
    for (const order of orders) {
      expect(order.businessDate).toBe(
        order.createdAt < dayStart ? "2026-11-06" : "2026-11-07",
      );
    }
    expect(orders.some((o) => o.businessDate === "2026-11-06")).toBe(true);
  });

  it("refuses to write into a connection that points at a non-seedable database", async () => {
    const connection = mongoose.connection;
    const original = { name: connection.name, host: connection.host };
    // Simulates a caller that connected to the production cluster without assertSeedableUri.
    Object.assign(connection, {
      name: "namitiszunk",
      host: "cluster0.abcde.mongodb.net",
    });

    const act = seedDemo(now);

    await expect(act).rejects.toThrow(/Refusing to seed/);
    Object.assign(connection, original);
    expect(await Venue.countDocuments()).toBe(0);
  });
});

describe("assertSeedableUri", () => {
  it.each([
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/namitiszunk?retryWrites=true",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/",
    "mongodb://db.example.com:27017/namitiszunk_prod",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/namitiszunk#test",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/namitiszunk_latest",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/contest",
    "not a uri",
  ])("rejects %s", (uri) => {
    const act = () => assertSeedableUri(uri);

    expect(act).toThrow(/Refusing to seed/);
  });

  it.each([
    "mongodb://localhost:27017/namitiszunk",
    "mongodb://127.0.0.1:51234,127.0.0.1:51235/x?replicaSet=rs",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/namitiszunk_dev",
    "mongodb+srv://app:secret@cluster0.abcde.mongodb.net/namitiszunk_test?w=majority",
  ])("accepts %s", (uri) => {
    const act = () => assertSeedableUri(uri);

    expect(act).not.toThrow();
  });

  it("returns the database name for mongoose.connect", () => {
    const uri =
      "mongodb+srv://app:s@cluster0.abcde.mongodb.net/namitiszunk_dev?w=majority";

    const dbName = assertSeedableUri(uri);

    expect(dbName).toBe("namitiszunk_dev");
  });
});
