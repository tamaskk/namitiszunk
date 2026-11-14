import {
  Bar,
  connectDb,
  Item,
  Order,
  type OrderStatus,
  Payment,
  Refund,
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
import { getDashboard } from "./dashboard";
import { getDailyReport } from "./reports";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_dashboard_test"));
  await Promise.all(
    [Venue, Bar, Item, Order, Payment, Refund, VenueMember].map((m) =>
      m.createCollection(),
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

// Friday 2026-11-13, 23:00 in Budapest (UTC+1): the business day under test.
const NOW = new Date("2026-11-13T22:00:00Z");
const DAY = "2026-11-13";
let shortNumber = 0;

async function seed({ pausedMinutesAgo }: { pausedMinutesAgo?: number } = {}) {
  const venueId = new Types.ObjectId();
  await Venue.create({
    _id: venueId,
    slug: `club-${venueId}`,
    name: "Club",
    ...(pausedMinutesAgo !== undefined && {
      ordersPausedAt: new Date(NOW.getTime() - pausedMinutesAgo * 60_000),
    }),
  });
  const [main, terrace] = await Bar.create([
    { venueId, name: "Főpult", isOpen: true, maxActiveOrders: 2 },
    {
      venueId,
      name: "Terasz",
      isOpen: true,
      pausedUntil: new Date(NOW.getTime() + 5 * 60_000),
    },
  ]);
  const categoryId = new Types.ObjectId();
  const [beer, mojito, wine] = await Item.create([
    { venueId, categoryId, name: "Sör", priceHuf: 1200, vatRate: 27 },
    {
      venueId,
      categoryId,
      name: "Mojito",
      priceHuf: 2500,
      vatRate: 27,
      isAvailable: false,
    },
    {
      venueId,
      categoryId,
      name: "Bor",
      nameEn: "Wine",
      priceHuf: 1500,
      vatRate: 27,
      isAvailable: false,
    },
  ]);
  const owner = await VenueMember.create({
    venueId,
    role: "owner",
    displayName: "Anna",
  });
  const order = (
    barId: Types.ObjectId,
    status: OrderStatus,
    item: { _id: Types.ObjectId; name: string; priceHuf?: number | null },
    fields: {
      accepted?: boolean;
      receipt?: boolean;
      businessDate?: string;
    } = {},
  ) => {
    shortNumber += 1;
    const price = item.priceHuf ?? 0;
    const paidAt = new Date(NOW.getTime() - 30 * 60_000);
    return Order.create({
      venueId,
      barId,
      shortNumber,
      businessDate: fields.businessDate ?? DAY,
      status,
      items: [
        {
          itemId: item._id,
          name: item.name,
          quantity: 1,
          unitPriceHuf: price,
          lineTotalHuf: price,
        },
      ],
      subtotalHuf: price,
      tipHuf: 0,
      totalHuf: price,
      pickupCode: "K7Q",
      guestTokenHash: new Types.ObjectId().toHexString(),
      acceptedTermsVersion: "draft-2026-11",
      paidAt,
      ...(fields.accepted && { acceptedAt: paidAt }),
      ...(fields.receipt && { receiptEnteredBy: owner._id }),
    });
  };
  return {
    venueId: String(venueId),
    main: main!,
    terrace: terrace!,
    beer: beer!,
    mojito: mojito!,
    wine: wine!,
    owner,
    order,
  };
}

const ownerOf = (s: Awaited<ReturnType<typeof seed>>): Actor => ({
  kind: "staff",
  venueId: s.venueId,
  memberId: String(s.owner._id),
  role: "owner",
});

describe("getDashboard", () => {
  it("shows the daily report's figures for the current business day", async () => {
    const s = await seed();
    await s.order(s.main._id, "picked_up", s.beer, { accepted: true });
    await s.order(s.main._id, "new", s.mojito);
    await s.order(s.terrace._id, "expired", s.beer);

    const dashboard = await getDashboard(ownerOf(s), s.venueId, NOW);
    const daily = await getDailyReport(ownerOf(s), s.venueId, DAY, NOW);

    expect(dashboard.businessDate).toBe(DAY);
    expect(dashboard.summary).toEqual(daily.summary);
    expect(dashboard.warnings.expiredOrders).toBe(1);
  });

  it("counts New and Preparing orders per bar and turns a bar red at its limit", async () => {
    const s = await seed();
    await s.order(s.main._id, "new", s.beer);
    await s.order(s.main._id, "preparing", s.beer, { accepted: true });
    await s.order(s.main._id, "ready", s.beer, { accepted: true });
    await s.order(s.main._id, "new", s.beer, { businessDate: "2026-11-12" });
    await s.order(s.terrace._id, "preparing", s.beer, { accepted: true });

    const { bars } = await getDashboard(ownerOf(s), s.venueId, NOW);

    expect(bars).toEqual([
      expect.objectContaining({
        name: "Főpult",
        activeOrders: 3,
        maxActiveOrders: 2,
        atCapacity: true,
        pausedUntil: null,
      }),
      expect.objectContaining({
        name: "Terasz",
        activeOrders: 1,
        maxActiveOrders: null,
        atCapacity: false,
        pausedUntil: "2026-11-13T22:05:00.000Z",
      }),
    ]);
  });

  it("lists sold-out items and marks a sold-out top product", async () => {
    const s = await seed();
    await s.order(s.main._id, "picked_up", s.mojito, { accepted: true });
    await s.order(s.main._id, "picked_up", s.beer, { accepted: true });

    const { products, soldOut } = await getDashboard(
      ownerOf(s),
      s.venueId,
      NOW,
    );

    expect(products.map((p) => [p.name, p.isAvailable]).sort()).toEqual([
      ["Mojito", false],
      ["Sör", true],
    ]);
    expect(soldOut).toEqual([
      { id: String(s.wine._id), name: "Bor", nameEn: "Wine" },
      { id: String(s.mojito._id), name: "Mojito" },
    ]);
  });

  it("warns about a venue pause left on, and about orders taken on without a receipt mark", async () => {
    const fresh = await seed({ pausedMinutesAgo: 5 });
    const forgotten = await seed({ pausedMinutesAgo: 20 });
    await forgotten.order(forgotten.main._id, "preparing", forgotten.beer, {
      accepted: true,
    });
    await forgotten.order(forgotten.main._id, "picked_up", forgotten.beer, {
      accepted: true,
      receipt: true,
    });
    await forgotten.order(forgotten.main._id, "new", forgotten.beer);

    const a = await getDashboard(ownerOf(fresh), fresh.venueId, NOW);
    const b = await getDashboard(ownerOf(forgotten), forgotten.venueId, NOW);

    expect(a.warnings.pausedSince).toBeNull();
    expect(a.ordersPausedAt).not.toBeNull();
    expect(b.warnings).toEqual({
      pausedSince: "2026-11-13T21:40:00.000Z",
      expiredOrders: 0,
      missingReceipts: 1,
    });
  });

  it("is refused to a bartender and offers the actions the role may take", async () => {
    const s = await seed();
    const bartender = await VenueMember.create({
      venueId: s.venueId,
      role: "bartender",
      displayName: "Bence",
    });
    const asBartender: Actor = {
      kind: "staff",
      venueId: s.venueId,
      memberId: String(bartender._id),
      role: "bartender",
    };

    await expect(
      getDashboard(asBartender, s.venueId, NOW),
    ).rejects.toMatchObject({ status: 403 });
    const owner = await getDashboard(ownerOf(s), s.venueId, NOW);

    expect(owner.can).toEqual({
      pauseBars: true,
      pauseVenue: true,
      setSoldOut: true,
    });
    expect(owner.channels).toEqual([
      `venue:${s.venueId}:bar:${String(s.main._id)}`,
      `venue:${s.venueId}:bar:${String(s.terrace._id)}`,
    ]);
  });
});
