import {
  AuditLog,
  connectDb,
  DeviceToken,
  Order,
  Payment,
  PlatformMember,
  Refund,
  Types,
  User,
  VenueMember,
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

import { runAccountRetention, runRetention } from "./retention";

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
      [
        Order,
        Payment,
        Refund,
        AuditLog,
        User,
        VenueMember,
        PlatformMember,
        DeviceToken,
      ].map((m) => m.createCollection()),
    );
    await User.db.createCollection("session");
    await User.db.createCollection("account");
    await User.db.createCollection("twoFactor");
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [
        Order,
        Payment,
        Refund,
        AuditLog,
        User,
        VenueMember,
        PlatformMember,
        DeviceToken,
      ].map((m) => m.collection.deleteMany({})),
    );
    await User.db.collection("session").deleteMany({});
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

  it("removes the card fingerprint only from payments older than 2 days", async () => {
    const insertPayment = async (createdAt: Date) => {
      const _id = new Types.ObjectId();
      await Payment.collection.insertOne({
        _id,
        orderId: new Types.ObjectId(),
        stripePaymentIntentId: String(_id),
        cardFingerprint: "fp_card_a",
        createdAt,
      });
      return _id;
    };
    const day2 = await insertPayment(daysAgo(2));
    const day3 = await insertPayment(daysAgo(3));

    const counts = await runRetention({ now, dryRun: false });

    const fingerprintOf = async (id: Types.ObjectId) =>
      (await Payment.collection.findOne({ _id: id }))
        ?.cardFingerprint as unknown;
    expect(counts.paymentsFingerprintCleared).toBe(1);
    expect(await fingerprintOf(day2)).toBe("fp_card_a");
    expect(await fingerprintOf(day3)).toBeUndefined();
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
      ordersReportContactCleared: 0,
      paymentsFingerprintCleared: 0,
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

  it("removes a problem report's e-mail only after 90 days, keeps the report", async () => {
    const orderId = await insertOrder(daysAgo(120));
    const report = (days: number, email?: string) => ({
      category: "wrong_order",
      message: `report ${days}`,
      ...(email ? { email } : {}),
      createdAt: daysAgo(days),
    });
    await Order.collection.updateOne(
      { _id: orderId },
      {
        $set: {
          problemReports: [
            report(89, "a@example.com"),
            report(90, "b@example.com"),
            report(91, "c@example.com"),
          ],
        },
      },
    );

    const counts = await runRetention({ now, dryRun: false });

    const reports = (await Order.collection.findOne({ _id: orderId }))
      ?.problemReports as { email?: string; message: string }[];
    expect(counts.ordersReportContactCleared).toBe(1);
    expect(reports.map((r) => r.email)).toEqual([
      "a@example.com",
      // Exactly 90 days is not "older than 90 days".
      "b@example.com",
      undefined,
    ]);
    expect(reports[2]?.message).toBe("report 91");
  });

  describe("inactive accounts", () => {
    async function insertUser(
      fields: { lastSignInAt?: Date; createdAt?: Date } = {},
    ) {
      const _id = new Types.ObjectId();
      await User.collection.insertOne({
        _id,
        email: `${String(_id)}@example.com`,
        createdAt: fields.createdAt ?? yearsAgo(5),
        ...(fields.lastSignInAt ? { lastSignInAt: fields.lastSignInAt } : {}),
      });
      return _id;
    }
    const userExists = async (id: Types.ObjectId) =>
      (await User.collection.countDocuments({ _id: id })) === 1;

    it("deletes an account whose last sign-in and last order are older than 2 years", async () => {
      const older = await insertUser({ lastSignInAt: yearsAgo(2, -1) });
      const younger = await insertUser({ lastSignInAt: yearsAgo(2, 1) });
      const orderId = await insertOrder(yearsAgo(3));
      await Order.collection.updateOne(
        { _id: orderId },
        { $set: { userId: older } },
      );
      await User.db
        .collection("session")
        .insertOne({ userId: older, createdAt: yearsAgo(3) });
      await DeviceToken.collection.insertOne({
        userId: older,
        token: "push-older",
      });
      await User.db
        .collection("twoFactor")
        .insertOne({ userId: older, secret: "totp-secret" });

      const counts = await runAccountRetention({ now, dryRun: false });

      expect(counts.accountsDeleted).toBe(1);
      expect(await userExists(older)).toBe(false);
      expect(await userExists(younger)).toBe(true);
      // The order stays for the books, without the account.
      const order = await Order.collection.findOne({ _id: orderId });
      expect(order).not.toBeNull();
      expect(order?.userId).toBeUndefined();
      expect(
        await User.db.collection("session").countDocuments({ userId: older }),
      ).toBe(0);
      expect(await DeviceToken.collection.countDocuments()).toBe(0);
      expect(await User.db.collection("twoFactor").countDocuments()).toBe(0);
      // One audit entry per deleted account, by the system, without personal data.
      const entries = await AuditLog.find({ action: "account.deleted" }).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.actor?.type).toBe("system");
      expect(String(entries[0]?.target?.id)).toBe(String(older));
      expect(JSON.stringify(entries[0])).not.toContain("@example.com");
    });

    it("keeps an account created less than 2 years ago that never stamped a sign-in", async () => {
      const userId = await insertUser({ createdAt: yearsAgo(2, 1) });

      await runAccountRetention({ now, dryRun: false });

      expect(await userExists(userId)).toBe(true);
    });

    it("counts a live session stored with a string user id", async () => {
      const userId = await insertUser({ createdAt: yearsAgo(3) });
      await User.db.collection("session").insertOne({
        userId: String(userId),
        createdAt: daysAgo(1),
        updatedAt: daysAgo(1),
      });

      await runAccountRetention({ now, dryRun: false });

      expect(await userExists(userId)).toBe(true);
    });

    it("keeps a platform member's account, however old", async () => {
      const userId = await insertUser({ lastSignInAt: yearsAgo(4) });
      await PlatformMember.collection.insertOne({ userId, role: "support" });

      const counts = await runAccountRetention({ now, dryRun: false });

      expect(counts.accountsDeleted).toBe(0);
      expect(await userExists(userId)).toBe(true);
    });

    it("keeps an account with an order in the last 2 years", async () => {
      const userId = await insertUser({ lastSignInAt: yearsAgo(3) });
      const orderId = await insertOrder(daysAgo(10));
      await Order.collection.updateOne({ _id: orderId }, { $set: { userId } });

      await runAccountRetention({ now, dryRun: false });

      expect(await userExists(userId)).toBe(true);
    });

    it("keeps an account from before lastSignInAt that still has a recent session", async () => {
      const userId = await insertUser({ createdAt: yearsAgo(3) });
      await User.db
        .collection("session")
        .insertOne({ userId, createdAt: daysAgo(5), updatedAt: daysAgo(5) });

      await runAccountRetention({ now, dryRun: false });

      expect(await userExists(userId)).toBe(true);
    });

    it("keeps a venue member's account, however old", async () => {
      const userId = await insertUser({ lastSignInAt: yearsAgo(4) });
      await VenueMember.collection.insertOne({
        venueId: new Types.ObjectId(),
        userId,
        role: "owner",
        displayName: "Owner",
      });

      const counts = await runAccountRetention({ now, dryRun: false });

      expect(counts.accountsDeleted).toBe(0);
      expect(await userExists(userId)).toBe(true);
    });

    it("only counts inactive accounts in a dry run", async () => {
      const userId = await insertUser({ lastSignInAt: yearsAgo(3) });

      const counts = await runAccountRetention({ now, dryRun: true });

      expect(counts.accountsDeleted).toBe(1);
      expect(await userExists(userId)).toBe(true);
    });
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
      ordersReportContactCleared: 0,
      paymentsFingerprintCleared: 0,
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
      ordersReportContactCleared: 0,
      paymentsFingerprintCleared: 0,
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
