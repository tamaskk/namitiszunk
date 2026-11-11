import {
  AuditLog,
  Bar,
  Category,
  connectDb,
  Item,
  Order,
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

import type { Actor } from "../auth/permissions";
import {
  getBarPicker,
  getBarView,
  moveOrderToBar,
  rejectFromBar,
  sendReminderFromBar,
  setBarPaused,
  setReceiptEntered,
} from "./bar-view";

vi.mock("server-only", () => ({}));
const publish = vi.hoisted(() => vi.fn());
vi.mock("ably", () => ({
  Rest: class {
    channels = {
      get: (name: string) => ({ publish: publish.bind(null, name) }),
    };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_bar_view_test"));
  await Promise.all(
    [Venue, Bar, Category, Item, Order, VenueMember, AuditLog].map((m) =>
      m.createCollection(),
    ),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  publish.mockClear();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

// 23:00 Budapest on 2026-11-11: business day "2026-11-11".
const now = new Date("2026-11-11T22:00:00Z");

async function seed() {
  const venueId = new Types.ObjectId();
  await Venue.create({ _id: venueId, slug: "pilot", name: "Pilot" });
  const [main, terrace] = await Bar.create([
    { venueId, name: "Főpult", isOpen: true, maxActiveOrders: 10 },
    { venueId, name: "Terasz", isOpen: true },
  ]);
  const category = await Category.create({ venueId, name: "Italok" });
  const [beer, water] = await Item.create([
    {
      venueId,
      categoryId: category._id,
      name: "Cerveza",
      priceHuf: 1500,
      vatRate: 27,
      alcoholPercent: 4.5,
      barIds: [main!._id],
    },
    {
      venueId,
      categoryId: category._id,
      name: "Víz",
      priceHuf: 600,
      vatRate: 27,
      barIds: [main!._id],
    },
  ]);
  const bartenderMember = await VenueMember.create({
    venueId,
    role: "bartender",
    displayName: "Anna",
  });
  const bartender: Actor = {
    kind: "staff",
    venueId: String(venueId),
    memberId: String(bartenderMember._id),
    role: "bartender",
  };
  return {
    venueId: String(venueId),
    mainId: String(main!._id),
    terraceId: String(terrace!._id),
    beerId: String(beer!._id),
    waterId: String(water!._id),
    bartender,
  };
}

let seq = 0;
// Fixtures may set a status directly; app code may not (no-status-writes.test.ts).
async function order(
  s: Awaited<ReturnType<typeof seed>>,
  overrides: Record<string, unknown> = {},
) {
  seq += 1;
  return Order.create({
    venueId: s.venueId,
    barId: s.mainId,
    shortNumber: seq,
    businessDate: "2026-11-11",
    status: "new",
    items: [
      {
        itemId: s.waterId,
        name: "Víz",
        unitPriceHuf: 600,
        quantity: 1,
        lineTotalHuf: 600,
      },
    ],
    subtotalHuf: 600,
    totalHuf: 600,
    pickupCode: "K7Q",
    guestTokenHash: String(seq).padStart(64, "a"),
    acceptedTermsVersion: "2026-11-01",
    paidAt: now,
    ...overrides,
  });
}

describe("getBarView", () => {
  it("lists today's waiting and expired orders of the bar, with 18+ and the prep time", async () => {
    const s = await seed();
    await order(s, {
      items: [
        {
          itemId: s.beerId,
          name: "Cerveza",
          unitPriceHuf: 1500,
          quantity: 2,
          lineTotalHuf: 3000,
          options: [{ groupName: "Méret", name: "0,5 l" }],
        },
      ],
    });
    await order(s, {
      status: "picked_up",
      acceptedAt: new Date(now.getTime() - 20 * 60_000),
      readyAt: new Date(now.getTime() - 14 * 60_000),
    });
    await order(s, { status: "expired" });
    await order(s, { barId: s.terraceId });
    await order(s, { businessDate: "2026-11-10" });

    const view = await getBarView(s.bartender, s.mainId, now);

    expect(view.bar).toMatchObject({ name: "Főpult", maxActiveOrders: 10 });
    expect(view.otherBars).toEqual([{ id: s.terraceId, name: "Terasz" }]);
    expect(view.orders.map((o) => o.status)).toEqual(["new", "expired"]);
    expect(view.orders[0]).toMatchObject({
      adult: true,
      items: [
        {
          itemId: s.beerId,
          name: "Cerveza",
          quantity: 2,
          options: ["0,5 l"],
        },
      ],
    });
    expect(view.orders[1]!.adult).toBe(false);
    expect(view.averagePrepMinutes).toBe(6);
    expect(view.products.map((p) => p.name)).toEqual(["Cerveza", "Víz"]);
  });

  it("refuses a VIP host and a member of another venue", async () => {
    const s = await seed();
    const vipHost: Actor = { ...s.bartender, role: "vip_host" } as Actor;
    const stranger: Actor = {
      ...s.bartender,
      venueId: new Types.ObjectId().toString(),
    } as Actor;

    await expect(getBarView(vipHost, s.mainId, now)).rejects.toThrow();
    await expect(getBarView(stranger, s.mainId, now)).rejects.toThrow();
  });
});

describe("setReceiptEntered", () => {
  it("logs the mark to the PIN holder and names them on the card", async () => {
    const s = await seed();
    const o = await order(s, { status: "preparing" });

    await setReceiptEntered(s.bartender, String(o._id), true, now);

    const view = await getBarView(s.bartender, s.mainId, now);
    expect(view.orders[0]!.receiptEnteredBy).toBe("Anna");
    const log = await AuditLog.findOne({
      action: "order.receiptEntered",
    }).lean();
    expect(log?.actor).toMatchObject({ type: "venue_member" });
    expect(String(log?.actor?.id)).toBe(
      (s.bartender as { memberId: string }).memberId,
    );
    expect(publish).toHaveBeenCalledWith(
      `venue:${s.venueId}:bar:${s.mainId}`,
      "update",
      expect.anything(),
    );
  });

  it("takes the mark back", async () => {
    const s = await seed();
    const o = await order(s, { status: "preparing" });
    await setReceiptEntered(s.bartender, String(o._id), true, now);

    await setReceiptEntered(s.bartender, String(o._id), false, now);

    const view = await getBarView(s.bartender, s.mainId, now);
    expect(view.orders[0]!.receiptEnteredBy).toBeNull();
  });

  it("refuses the mark on a New order", async () => {
    const s = await seed();
    const o = await order(s);

    await expect(
      setReceiptEntered(s.bartender, String(o._id), true, now),
    ).rejects.toMatchObject({ code: "invalid_status" });
  });
});

describe("setBarPaused", () => {
  it("pauses the bar for 10 minutes and resumes it", async () => {
    const s = await seed();

    const paused = await setBarPaused(s.bartender, s.mainId, 10, now);
    const pausedBar = await Bar.findById(s.mainId).lean();
    await setBarPaused(s.bartender, s.mainId, 0, now);
    const resumedBar = await Bar.findById(s.mainId).lean();

    expect(paused.pausedUntil).toBe("2026-11-11T22:10:00.000Z");
    expect(pausedBar?.pausedUntil?.toISOString()).toBe(paused.pausedUntil);
    expect(resumedBar?.pausedUntil).toBeUndefined();
  });
});

describe("moveOrderToBar", () => {
  it("moves a waiting order and tells both bars and the guest", async () => {
    const s = await seed();
    const o = await order(s, { status: "preparing" });

    await moveOrderToBar(s.bartender, String(o._id), s.terraceId);

    expect(String((await Order.findById(o._id).lean())?.barId)).toBe(
      s.terraceId,
    );
    const channels = publish.mock.calls.map(([name]) => name);
    expect(channels).toEqual([
      `venue:${s.venueId}:bar:${s.mainId}`,
      `venue:${s.venueId}:bar:${s.terraceId}`,
      `order:${String(o._id)}`,
    ]);
  });

  it("refuses a bar of another venue and a picked-up order", async () => {
    const s = await seed();
    const [foreign] = await Bar.create([
      { venueId: new Types.ObjectId(), name: "Más" },
    ]);
    const waiting = await order(s);
    const done = await order(s, { status: "picked_up" });

    await expect(
      moveOrderToBar(s.bartender, String(waiting._id), String(foreign!._id)),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      moveOrderToBar(s.bartender, String(done._id), s.terraceId),
    ).rejects.toMatchObject({ code: "invalid_status" });
  });
});

describe("rejectFromBar", () => {
  it("rejects a New order as sold out and marks the chosen item sold out", async () => {
    const s = await seed();
    const o = await order(s);

    await rejectFromBar(s.bartender, String(o._id), {
      reason: "sold_out",
      soldOutItemIds: [s.waterId],
    });

    const rejected = await Order.findById(o._id).lean();
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectionReason: "sold_out",
    });
    expect((await Item.findById(s.waterId).lean())?.isAvailable).toBe(false);
  });

  it("asks which item is sold out and refuses an item not on the order", async () => {
    const s = await seed();
    const o = await order(s);

    await expect(
      rejectFromBar(s.bartender, String(o._id), { reason: "sold_out" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      rejectFromBar(s.bartender, String(o._id), {
        reason: "sold_out",
        soldOutItemIds: [s.beerId],
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect((await Order.findById(o._id).lean())?.status).toBe("new");
  });

  it("keeps the rejection when the sold-out mark fails afterwards", async () => {
    const s = await seed();
    const o = await order(s);
    await Item.updateOne({ _id: s.waterId }, { $set: { archivedAt: now } });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await rejectFromBar(s.bartender, String(o._id), {
      reason: "sold_out",
      soldOutItemIds: [s.waterId],
    });

    expect((await Order.findById(o._id).lean())?.status).toBe("rejected");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("refuses a rejection once the order is in progress", async () => {
    const s = await seed();
    const o = await order(s, { status: "preparing" });

    await expect(
      rejectFromBar(s.bartender, String(o._id), { reason: "other" }),
    ).rejects.toMatchObject({ code: "invalid_status" });
  });
});

describe("sendReminderFromBar", () => {
  const deps = () => ({
    sendPush: vi.fn(async () => true),
    sendEmail: vi.fn(async () => ({})),
    links: {
      order: (id: string) => `https://rendel.namitiszunk.hu/o/${id}`,
      smsStatusCallback: "https://api.namitiszunk.hu/webhooks/twilio",
    },
  });

  it("sends once from a Ready card, then answers 409", async () => {
    const s = await seed();
    const o = await order(s, { status: "ready", readyAt: now });

    const sent = await sendReminderFromBar(s.bartender, String(o._id), deps());

    expect(sent).toBe("push");
    await expect(
      sendReminderFromBar(s.bartender, String(o._id), deps()),
    ).rejects.toMatchObject({ code: "reminder_not_sendable" });
    expect(
      await AuditLog.countDocuments({ action: "order.reminderSent" }),
    ).toBe(1);
  });
});

describe("permissions", () => {
  it("answers 404 for an order of another venue, so an id never tells it exists", async () => {
    const s = await seed();
    const o = String((await order(s, { status: "preparing" }))._id);
    const stranger: Actor = {
      ...s.bartender,
      venueId: new Types.ObjectId().toString(),
    } as Actor;

    const calls = [
      setReceiptEntered(stranger, o, true, now),
      moveOrderToBar(stranger, o, s.terraceId),
      sendReminderFromBar(stranger, o, {
        sendPush: vi.fn(async () => true),
        sendEmail: vi.fn(async () => ({})),
        links: { order: () => "", smsStatusCallback: "" },
      }),
      rejectFromBar(stranger, o, { reason: "other" }),
    ];

    for (const call of calls)
      await expect(call).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps a VIP host off the bar's pause and move", async () => {
    const s = await seed();
    const o = String((await order(s))._id);
    const vipHost = { ...s.bartender, role: "vip_host" } as Actor;

    await expect(setBarPaused(vipHost, s.mainId, 5, now)).rejects.toThrow();
    await expect(moveOrderToBar(vipHost, o, s.terraceId)).rejects.toThrow();
    expect(String((await Order.findById(o).lean())?.barId)).toBe(s.mainId);
  });
});

describe("getBarPicker", () => {
  it("lists the venue's bars and names the PIN holder", async () => {
    const s = await seed();

    const picker = await getBarPicker(s.bartender, s.venueId);

    expect(picker).toEqual({
      bars: [
        { id: s.mainId, name: "Főpult" },
        { id: s.terraceId, name: "Terasz" },
      ],
      staffName: "Anna",
    });
  });
});
