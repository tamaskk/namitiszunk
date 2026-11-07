import {
  AuditLog,
  connectDb,
  Order,
  Payment,
  Refund,
  Types,
} from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { runRetention } from "./retention";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-07T06:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const yearsAgo = (years: number, plusDays = 0) => {
  const at = new Date(now);
  at.setUTCFullYear(at.getUTCFullYear() - years);
  return new Date(at.getTime() + plusDays * DAY_MS);
};

// Raw inserts keep the fixture's createdAt; Mongoose timestamps would overwrite it.
async function insertOrder(createdAt: Date, guestPhone?: string) {
  const _id = new Types.ObjectId();
  await Order.collection.insertOne({
    _id,
    // Unique per order so the schema's unique indexes accept the fixtures.
    venueId: _id,
    businessDate: "2026-01-01",
    shortNumber: 1,
    guestTokenHash: String(_id),
    userId: new Types.ObjectId(),
    totalHuf: 2400,
    createdAt,
    ...(guestPhone ? { guestPhone } : {}),
  });
  return _id;
}

async function insertPaymentAndRefund(
  createdAt: Date,
  orderId: Types.ObjectId,
) {
  const paymentId = new Types.ObjectId();
  await Payment.collection.insertOne({
    _id: paymentId,
    orderId,
    stripePaymentIntentId: String(paymentId),
    createdAt,
  });
  await Refund.collection.insertOne({ paymentId, orderId, createdAt });
}

describe("runRetention", () => {
  let replSet: MongoMemoryReplSet;
  let mongoose: Awaited<ReturnType<typeof connectDb>>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    mongoose = await connectDb(replSet.getUri("namitiszunk_retention_test"));
    await Promise.all(
      [Order, Payment, Refund, AuditLog].map((m) => m.createCollection()),
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [Order, Payment, Refund, AuditLog].map((m) =>
        m.collection.deleteMany({}),
      ),
    );
  });

  it("removes the guest phone only from orders older than 30 days", async () => {
    const day29 = await insertOrder(daysAgo(29), "+36301111111");
    const day30 = await insertOrder(daysAgo(30), "+36302222222");
    const day31 = await insertOrder(daysAgo(31), "+36303333333");

    const counts = await runRetention({ now, dryRun: false });

    const phoneOf = async (id: Types.ObjectId) =>
      (await Order.collection.findOne({ _id: id }))?.guestPhone as unknown;
    expect(counts.ordersContactCleared).toBe(1);
    expect(await phoneOf(day29)).toBe("+36301111111");
    // Exactly 30 days is not "older than 30 days".
    expect(await phoneOf(day30)).toBe("+36302222222");
    expect(await phoneOf(day31)).toBeUndefined();
    expect(await Order.collection.countDocuments({ _id: day31 })).toBe(1);
  });

  it("deletes orders, payments and refunds older than 8 years, keeps the rest", async () => {
    const older = await insertOrder(yearsAgo(8, -1));
    const exact = await insertOrder(yearsAgo(8));
    const younger = await insertOrder(yearsAgo(8, 1));
    await insertPaymentAndRefund(yearsAgo(8, -1), older);
    await insertPaymentAndRefund(yearsAgo(8, 1), younger);

    const counts = await runRetention({ now, dryRun: false });

    expect(counts).toEqual({
      ordersContactCleared: 0,
      ordersDeleted: 1,
      paymentsDeleted: 1,
      refundsDeleted: 1,
    });
    const remaining = await Order.collection.distinct("_id");
    expect(remaining.map(String).sort()).toEqual(
      [exact, younger].map(String).sort(),
    );
    expect(await Payment.collection.countDocuments({ orderId: older })).toBe(0);
    expect(await Refund.collection.countDocuments({ orderId: older })).toBe(0);
    expect(await Payment.collection.countDocuments({ orderId: younger })).toBe(
      1,
    );
  });

  it("logs a live run as one system audit entry without personal data", async () => {
    await insertOrder(daysAgo(31), "+36303333333");

    await runRetention({ now, dryRun: false });

    const entries = await AuditLog.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor?.type).toBe("system");
    expect(entries[0]?.action).toBe("retention.run");
    expect(entries[0]?.after).toMatchObject({ ordersContactCleared: 1 });
    expect(JSON.stringify(entries[0])).not.toContain("+3630");
  });

  it("never deletes audit log entries, however old", async () => {
    await AuditLog.collection.insertOne({
      actor: { type: "system" },
      action: "fee_rule.changed",
      target: { type: "fee_rule", id: new Types.ObjectId() },
      createdAt: yearsAgo(20),
    });
    await insertOrder(yearsAgo(9));

    await runRetention({ now, dryRun: false });

    expect(
      await AuditLog.collection.countDocuments({ action: "fee_rule.changed" }),
    ).toBe(1);
  });

  it("is a no-op on the second run", async () => {
    await insertOrder(daysAgo(31), "+36303333333");
    await insertOrder(yearsAgo(9));
    await runRetention({ now, dryRun: false });
    const auditCount = await AuditLog.countDocuments();

    const second = await runRetention({ now, dryRun: false });

    expect(second).toEqual({
      ordersContactCleared: 0,
      ordersDeleted: 0,
      paymentsDeleted: 0,
      refundsDeleted: 0,
    });
    expect(await AuditLog.countDocuments()).toBe(auditCount);
    expect(await Order.collection.countDocuments()).toBe(1);
  });

  it("only counts in a dry run and writes nothing", async () => {
    const recent = await insertOrder(daysAgo(31), "+36303333333");
    const old = await insertOrder(yearsAgo(9));
    await insertPaymentAndRefund(yearsAgo(9), old);

    const counts = await runRetention({ now, dryRun: true });

    expect(counts).toEqual({
      ordersContactCleared: 1,
      ordersDeleted: 1,
      paymentsDeleted: 1,
      refundsDeleted: 1,
    });
    expect((await Order.collection.findOne({ _id: recent }))?.guestPhone).toBe(
      "+36303333333",
    );
    expect(await Order.collection.countDocuments()).toBe(2);
    expect(await Payment.collection.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
