import {
  AuditLog,
  Bar,
  connectDb,
  DeviceToken,
  Item,
  Order,
  Review,
  User,
  Venue,
  VenueMember,
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

import { ConflictError, NotFoundError } from "../errors";
import {
  claimDeviceOrders,
  deleteAccount,
  exportAccountData,
  listAccountOrders,
  reorder,
} from "./account";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_account_test"));
  await Promise.all(
    [Order, User, AuditLog, DeviceToken, Review, VenueMember].map((m) =>
      m.createCollection(),
    ),
  );
  await Promise.all(
    ["session", "account"].map((name) =>
      mongoose.connection.createCollection(name),
    ),
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

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

async function seed() {
  const [venue] = await Venue.create([{ slug: "pilot", name: "Pilot" }]);
  const [bar] = await Bar.create([{ venueId: venue!._id, name: "Főpult" }]);
  const categoryId = new Types.ObjectId();
  const [gin, cola, beer] = await Item.create([
    {
      venueId: venue!._id,
      categoryId,
      name: "Gin tonic",
      priceHuf: 2500,
      vatRate: 27,
      modifierGroups: [
        {
          name: "Gin",
          modifiers: [
            { name: "Bombay", priceDeltaHuf: 300 },
            { name: "Hendrick's", priceDeltaHuf: 600 },
          ],
        },
      ],
    },
    {
      venueId: venue!._id,
      categoryId,
      name: "Coca-Cola",
      priceHuf: 700,
      vatRate: 27,
      isAvailable: false,
    },
    {
      venueId: venue!._id,
      categoryId,
      name: "Sör",
      priceHuf: 900,
      vatRate: 27,
    },
  ]);
  const [user] = await User.create([
    { email: "vendeg@example.com", name: "Vendég Anna", phone: "+36301234567" },
  ]);
  return {
    venue: venue!,
    bar: bar!,
    gin: gin!,
    cola: cola!,
    beer: beer!,
    user: user!,
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

let shortNumber = 100;
async function order(s: Seeded, fields: Record<string, unknown> = {}) {
  shortNumber += 1;
  const [created] = await Order.create([
    {
      venueId: s.venue._id,
      barId: s.bar._id,
      shortNumber,
      businessDate: "2026-11-07",
      status: "picked_up",
      items: [
        {
          itemId: s.gin._id,
          name: "Gin tonic",
          unitPriceHuf: 2400,
          quantity: 2,
          options: [{ groupName: "Gin", name: "Bombay", priceDeltaHuf: 300 }],
          lineTotalHuf: 5400,
        },
        {
          itemId: s.cola._id,
          name: "Coca-Cola",
          unitPriceHuf: 700,
          quantity: 1,
          lineTotalHuf: 700,
        },
      ],
      subtotalHuf: 6100,
      totalHuf: 6100,
      pickupCode: "K7Q",
      guestTokenHash: `${String(shortNumber).padStart(3, "0")}${"c".repeat(61)}`,
      acceptedTermsVersion: "2026-11-01",
      ...fields,
    },
  ]);
  return created!;
}

const userActor = (s: Seeded) =>
  ({ kind: "user", userId: String(s.user._id), memberships: [] }) as const;

describe("claimDeviceOrders", () => {
  it("moves only the orders whose token matches and that have no account yet", async () => {
    const s = await seed();
    const mine = await order(s, { guestTokenHash: hashA });
    const wrongToken = await order(s, { guestTokenHash: hashB });
    const otherAccount = await order(s, {
      guestTokenHash: "d".repeat(64),
      userId: new Types.ObjectId(),
    });

    const result = await claimDeviceOrders(userActor(s), [
      { orderId: String(mine._id), tokenHash: hashA },
      { orderId: String(wrongToken._id), tokenHash: hashA },
      { orderId: String(otherAccount._id), tokenHash: "d".repeat(64) },
    ]);

    expect(result).toEqual({ claimed: 1 });
    const owner = async (id: Types.ObjectId) =>
      String((await Order.findById(id).lean())?.userId);
    expect(await owner(mine._id)).toBe(String(s.user._id));
    expect(await owner(wrongToken._id)).toBe("undefined");
    expect(await owner(otherAccount._id)).not.toBe(String(s.user._id));
  });
});

describe("listAccountOrders", () => {
  it("lists only the account's orders, newest first, with the venue", async () => {
    const s = await seed();
    const older = await order(s, {
      userId: s.user._id,
      createdAt: new Date("2026-11-01T22:00:00Z"),
    });
    const newer = await order(s, {
      userId: s.user._id,
      createdAt: new Date("2026-11-07T22:00:00Z"),
    });
    await order(s, { userId: new Types.ObjectId() });

    const list = await listAccountOrders(userActor(s));

    expect(list.map((o) => o.id)).toEqual([
      String(newer._id),
      String(older._id),
    ]);
    expect(list[0]).toMatchObject({
      venueName: "Pilot",
      venueSlug: "pilot",
      totalHuf: 6100,
      status: "picked_up",
    });
  });
});

describe("exportAccountData", () => {
  it("holds the profile, logins, orders with phone and reports, and reviews of the account only", async () => {
    const s = await seed();
    const mine = await order(s, {
      userId: s.user._id,
      guestPhone: "+36301234567",
      problemReports: [
        {
          category: "wrong_order",
          message: "Nem ezt kértem",
          email: "vendeg@example.com",
          createdAt: new Date(),
        },
      ],
    });
    const theirs = await order(s, { userId: new Types.ObjectId() });
    await Review.create([
      { venueId: s.venue._id, orderId: mine._id, stars: 4, text: "Jó volt" },
      { venueId: s.venue._id, orderId: theirs._id, stars: 1 },
    ]);
    await mongoose.connection.collection("account").insertOne({
      userId: s.user._id,
      providerId: "google",
      createdAt: new Date(),
    });

    const data = await exportAccountData(userActor(s));

    expect(data.profile).toMatchObject({
      email: "vendeg@example.com",
      name: "Vendég Anna",
      phone: "+36301234567",
    });
    expect(data.logins).toEqual([
      expect.objectContaining({ provider: "google" }),
    ]);
    expect(data.orders.map((o) => o.id)).toEqual([String(mine._id)]);
    expect(data.orders[0]).toMatchObject({
      guestPhone: "+36301234567",
      problemReports: [
        expect.objectContaining({ email: "vendeg@example.com" }),
      ],
    });
    expect(data.reviews).toEqual([
      expect.objectContaining({ orderId: String(mine._id), stars: 4 }),
    ]);
  });
});

describe("deleteAccount", () => {
  it("removes the user, sessions, logins and push tokens, and keeps the orders without the account", async () => {
    const s = await seed();
    const kept = await order(s, { userId: s.user._id });
    const sessions = mongoose.connection.collection("session");
    const logins = mongoose.connection.collection("account");
    await sessions.insertMany([
      { userId: s.user._id, token: "t1" },
      { userId: String(s.user._id), token: "t2" },
      { userId: new Types.ObjectId(), token: "other" },
    ]);
    await logins.insertOne({ userId: s.user._id, providerId: "apple" });
    await DeviceToken.create([
      { userId: s.user._id, token: "push-1", platform: "ios" },
    ]);

    const result = await deleteAccount(userActor(s));

    expect(result).toEqual({ ordersDetached: 1 });
    expect(await User.countDocuments()).toBe(0);
    expect(await sessions.countDocuments()).toBe(1);
    expect(await logins.countDocuments()).toBe(0);
    expect(await DeviceToken.countDocuments()).toBe(0);
    const order_ = await Order.findById(kept._id).lean();
    expect(order_?.totalHuf).toBe(6100);
    expect(order_?.userId).toBeUndefined();
    const entries = await AuditLog.find({ action: "account.deleted" }).lean();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).not.toContain("vendeg@example.com");
  });

  it("refuses a user who is staff at a venue with 409 staff_account", async () => {
    const s = await seed();
    await VenueMember.create([
      {
        venueId: s.venue._id,
        userId: s.user._id,
        role: "manager",
        displayName: "Anna",
      },
    ]);

    const result = deleteAccount(userActor(s));

    await expect(result).rejects.toThrow(ConflictError);
    await expect(result).rejects.toMatchObject({ code: "staff_account" });
    expect(await User.countDocuments()).toBe(1);
  });
});

describe("reorder", () => {
  it("gives the lines at today's prices with option ids, and names what it skipped", async () => {
    const s = await seed();
    const past = await order(s, { guestTokenHash: hashA });

    const cart = await reorder(
      { kind: "guest", guestId: hashA },
      String(past._id),
    );

    const bombay = s.gin.modifierGroups[0]!.modifiers[0]!;
    expect(cart).toMatchObject({
      venueSlug: "pilot",
      barId: String(s.bar._id),
      lines: [
        {
          itemId: String(s.gin._id),
          unitPriceHuf: 2800,
          quantity: 2,
          modifierIds: [String(bombay._id)],
          options: ["Bombay"],
        },
      ],
      skipped: ["Coca-Cola"],
    });
  });

  it("skips a line whose option no longer exists", async () => {
    const s = await seed();
    const past = await order(s, {
      userId: s.user._id,
      items: [
        {
          itemId: s.gin._id,
          name: "Gin tonic",
          unitPriceHuf: 2500,
          quantity: 1,
          options: [
            { groupName: "Gin", name: "Tanqueray", priceDeltaHuf: 400 },
          ],
          lineTotalHuf: 2900,
        },
        {
          itemId: s.beer._id,
          name: "Sör",
          unitPriceHuf: 900,
          quantity: 3,
          lineTotalHuf: 2700,
        },
      ],
    });

    const cart = await reorder(userActor(s), String(past._id));

    expect(cart.lines.map((l) => l.name)).toEqual(["Sör"]);
    expect(cart.skipped).toEqual(["Gin tonic"]);
  });

  it("answers 404 for another guest's or another account's order", async () => {
    const s = await seed();
    const past = await order(s, { guestTokenHash: hashA });

    await expect(
      reorder({ kind: "guest", guestId: hashB }, String(past._id)),
    ).rejects.toThrow(NotFoundError);
    await expect(reorder(userActor(s), String(past._id))).rejects.toThrow(
      NotFoundError,
    );
  });
});
