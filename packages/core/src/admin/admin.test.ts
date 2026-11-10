import {
  AuditLog,
  Bar,
  connectDb,
  Order,
  Refund,
  Venue,
} from "@namitiszunk/db";
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
import { getVenueStatus } from "../menu/venue-status";
import { adminModules, canOpenModule, requireModule } from "./modules";
import {
  listAdminNotifications,
  listAdminVenues,
  setVenueOrdersPaused,
} from "./venue-admin";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_admin_test"));
  await Promise.all(
    [Venue, Bar, Order, Refund, AuditLog].map((m) => m.createCollection()),
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

const now = new Date("2026-11-10T21:00:00Z");

async function seed() {
  const [venue] = await Venue.create([
    { slug: "pilot", name: "Pilot", status: "active" },
  ]);
  const [bar] = await Bar.create([
    { venueId: venue!._id, name: "Főpult", isOpen: true },
  ]);
  return { venueId: String(venue!._id), bar: bar! };
}

const member = (venueId: string, role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [{ venueId, memberId: new Types.ObjectId().toString(), role }],
});

describe("admin modules", () => {
  const venueId = new Types.ObjectId().toString();
  const open = (role: VenueRole) =>
    adminModules
      .filter((m) => canOpenModule(member(venueId, role), m.key, venueId))
      .map((m) => m.key);

  it("gives the owner every module and the manager the T-050 list", () => {
    expect(open("owner")).toEqual(adminModules.map((m) => m.key));
    expect(open("manager")).toEqual([
      "dashboard",
      "barView",
      "orders",
      "menu",
      "bars",
      "staff",
      "reports",
      "reviews",
    ]);
  });

  it("refuses another venue's member and a manager on owner modules", () => {
    const other = member(new Types.ObjectId().toString(), "owner");
    expect(canOpenModule(other, "dashboard", venueId)).toBe(false);
    expect(() =>
      requireModule(member(venueId, "manager"), "payouts", venueId),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("setVenueOrdersPaused", () => {
  it("pauses every bar for the guest until switched back, audited both ways", async () => {
    const { venueId } = await seed();
    const manager = member(venueId, "manager");

    await setVenueOrdersPaused(manager, { venueId, paused: true, now });
    expect(await getVenueStatus({ slug: "pilot", now })).toMatchObject({
      status: "paused",
      pausedUntil: null,
    });
    // A second pause keeps the first time and writes no new entry.
    const again = await setVenueOrdersPaused(manager, {
      venueId,
      paused: true,
      now: new Date(now.getTime() + 60_000),
    });
    expect(again.ordersPausedAt).toEqual(now);

    await setVenueOrdersPaused(manager, { venueId, paused: false, now });
    expect(await getVenueStatus({ slug: "pilot", now })).toMatchObject({
      status: "open",
    });
    const actions = (await AuditLog.find().sort({ _id: 1 }).lean()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["venue.ordersPaused", "venue.ordersResumed"]);
  });

  it("refuses a member of another venue and a bartender", async () => {
    const { venueId } = await seed();
    const stranger = member(new Types.ObjectId().toString(), "owner");
    const bartender = member(venueId, "bartender");

    for (const actor of [stranger, bartender])
      await expect(
        setVenueOrdersPaused(actor, { venueId, paused: true }),
      ).rejects.toMatchObject({ status: 403 });

    expect(await Venue.findById(venueId).lean()).not.toHaveProperty(
      "ordersPausedAt",
    );
  });
});

describe("listAdminVenues and listAdminNotifications", () => {
  it("lists only the member's venues", async () => {
    const { venueId } = await seed();
    await Venue.create([{ slug: "other", name: "Other" }]);
    const venues = await listAdminVenues(
      member(venueId, "owner") as Extract<Actor, { kind: "user" }>,
    );
    expect(venues).toEqual([
      { id: venueId, name: "Pilot", ordersPausedAt: null },
    ]);
  });

  it("returns recent problem reports and failed refunds, newest first, without personal data", async () => {
    const { venueId, bar } = await seed();
    const base = {
      venueId,
      barId: bar._id,
      businessDate: "2026-11-10",
      status: "picked_up" as const,
      items: [
        {
          itemId: new Types.ObjectId(),
          name: "Sör",
          unitPriceHuf: 1000,
          quantity: 1,
          lineTotalHuf: 1000,
        },
      ],
      subtotalHuf: 1000,
      totalHuf: 1000,
      pickupCode: "K7Q",
      acceptedTermsVersion: "2026-11-01",
    };
    const [reported, refunded, old] = await Order.create([
      {
        ...base,
        shortNumber: 1,
        guestTokenHash: "a".repeat(64),
        problemReports: [
          {
            category: "wrong_order",
            message: "x",
            email: "vendeg@example.com",
            createdAt: new Date(now.getTime() - 60_000),
          },
        ],
      },
      { ...base, shortNumber: 2, guestTokenHash: "b".repeat(64) },
      {
        ...base,
        shortNumber: 3,
        guestTokenHash: "c".repeat(64),
        problemReports: [
          {
            category: "wrong_order",
            createdAt: new Date(now.getTime() - 8 * 24 * 3600_000),
          },
        ],
      },
    ]);
    await Refund.collection.insertOne({
      venueId: new Types.ObjectId(venueId),
      paymentId: new Types.ObjectId(),
      orderId: refunded!._id,
      amountHuf: 1000,
      reason: "x",
      initiatedBy: { type: "system" },
      status: "failed",
      updatedAt: new Date(now.getTime() - 1000),
    });

    const items = await listAdminNotifications(member(venueId, "manager"), {
      venueId,
      now,
    });
    expect(items).toEqual([
      expect.objectContaining({ kind: "refundFailed", shortNumber: 2 }),
      expect.objectContaining({
        kind: "problemReport",
        orderId: String(reported!._id),
        shortNumber: 1,
      }),
    ]);
    expect(JSON.stringify(items)).not.toContain("example.com");
    expect(items.map((i) => i.orderId)).not.toContain(String(old!._id));
    // A bartender sees the problem report but not the failed refund.
    const forBartender = await listAdminNotifications(
      member(venueId, "bartender"),
      { venueId, now },
    );
    expect(forBartender.map((i) => i.kind)).toEqual(["problemReport"]);
  });
});
