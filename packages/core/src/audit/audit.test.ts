import { AuditLog, connectDb, FeeRule } from "@namitiszunk/db";
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

import { audit, type AuditEntry, stripPersonalData } from "./audit";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

const entry: AuditEntry = {
  actor: { type: "venue_member", id: new Types.ObjectId(), name: "Anna" },
  action: "fee_rule.changed",
  target: { type: "fee_rule", id: new Types.ObjectId() },
};

describe("stripPersonalData", () => {
  it("removes phone, email and PIN hash keys at any depth", () => {
    const id = new Types.ObjectId("65f0c0ffee0000000000abcd");
    const at = new Date("2026-11-07T22:00:00Z");

    const result = stripPersonalData({
      name: "Anna",
      phone: "+36301234567",
      guestPhone: "+36301234567",
      email: "anna@example.com",
      pinHash: "$argon2id$...",
      member: { id, pin_hash: "x", contactEmail: "a@b.hu", role: "bartender" },
      items: [{ qty: 2, phoneNumber: "1" }],
      at,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "at": 2026-11-07T22:00:00.000Z,
        "items": [
          {
            "qty": 2,
          },
        ],
        "member": {
          "id": "65f0c0ffee0000000000abcd",
          "role": "bartender",
        },
        "name": "Anna",
      }
    `);
  });

  it("strips a hydrated Mongoose document too", () => {
    const doc = new AuditLog({ ...entry, before: undefined });
    const withPhone = { toObject: () => ({ phone: "1", total: 5 }) };

    expect(stripPersonalData(withPhone)).toEqual({ total: 5 });
    expect(stripPersonalData(doc)).toHaveProperty("action", entry.action);
  });
});

describe("audit", () => {
  let replSet: MongoMemoryReplSet;
  let mongoose: Awaited<ReturnType<typeof connectDb>>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    mongoose = await connectDb(replSet.getUri("namitiszunk_audit_test"));
    await Promise.all([AuditLog.syncIndexes(), FeeRule.syncIndexes()]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await FeeRule.collection.deleteMany({});
    await AuditLog.collection.deleteMany({});
  });

  it("commits the change and its entry together, without personal data", async () => {
    const session = await mongoose.startSession();

    await session.withTransaction(async () => {
      await FeeRule.create([{ commissionBps: 300, validFrom: new Date() }], {
        session,
      });
      await audit(session, {
        ...entry,
        impersonatedBy: { id: new Types.ObjectId(), name: "Support" },
        after: { commissionBps: 300, ownerEmail: "o@club.hu" },
      });
    });
    await session.endSession();

    const logged = await AuditLog.findOne().lean();
    expect(await FeeRule.countDocuments()).toBe(1);
    expect(logged?.actor?.name).toBe("Anna");
    expect(logged?.impersonatedBy?.name).toBe("Support");
    expect(logged?.after).toEqual({ commissionBps: 300 });
  });

  it("rolls the change back when the audit write fails", async () => {
    const session = await mongoose.startSession();
    const brokenEntry = { ...entry, action: "" }; // fails the required validator

    const act = session.withTransaction(async () => {
      await FeeRule.create([{ commissionBps: 300, validFrom: new Date() }], {
        session,
      });
      await audit(session, brokenEntry);
    });

    await expect(act).rejects.toThrow(/action/);
    await session.endSession();
    expect(await FeeRule.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("refuses to write outside a transaction", async () => {
    const session = await mongoose.startSession();

    const act = audit(session, entry);

    await expect(act).rejects.toThrow(/inside the transaction/);
    await session.endSession();
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
