import {
  Bar,
  Category,
  connectDb,
  Item,
  Order,
  Types,
  Venue,
  Zone,
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

import {
  getPublicMenu,
  getVenueStatus,
  medianWaitMinutes,
  resolveMenuContext,
} from ".";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

const now = new Date("2026-11-07T22:00:00Z");
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000);

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;
const ids = {
  venue: new Types.ObjectId(),
  otherVenue: new Types.ObjectId(),
  bar: new Types.ObjectId(),
  otherBar: new Types.ObjectId(),
  terraceBar: new Types.ObjectId(),
  danceZone: new Types.ObjectId(),
  vipZone: new Types.ObjectId(),
  foreignVipZone: new Types.ObjectId(),
  drinks: new Types.ObjectId(),
  bottles: new Types.ObjectId(),
  beer: new Types.ObjectId(),
  gin: new Types.ObjectId(),
  vodka: new Types.ObjectId(),
  oldItem: new Types.ObjectId(),
};

async function insertReadyOrder(
  paidMinutesAgo: number,
  waitMinutes: number,
  status = "picked_up",
) {
  const paidAt = minutesAgo(paidMinutesAgo);
  await Order.collection.insertOne({
    status,
    venueId: ids.venue,
    barId: ids.bar,
    businessDate: "2026-11-07",
    shortNumber: Math.floor(Math.random() * 1e9),
    guestTokenHash: String(new Types.ObjectId()),
    paidAt,
    readyAt: new Date(paidAt.getTime() + waitMinutes * 60_000),
  });
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_menu_test"));
  await Venue.create([
    { _id: ids.venue, slug: "demo", name: "Demo Klub", status: "active" },
    { _id: ids.otherVenue, slug: "other", name: "Other", status: "active" },
    { slug: "draft", name: "Draft", status: "draft" },
  ]);
  await Bar.create([
    { _id: ids.bar, venueId: ids.venue, name: "Főpult", isOpen: true },
    { _id: ids.otherBar, venueId: ids.otherVenue, name: "X", isOpen: true },
    { _id: ids.terraceBar, venueId: ids.venue, name: "Terasz", isOpen: true },
  ]);
  await Zone.create([
    { _id: ids.danceZone, venueId: ids.venue, barId: ids.bar, name: "Tánctér" },
    {
      _id: ids.vipZone,
      venueId: ids.venue,
      barId: ids.bar,
      name: "VIP 1",
      type: "vip_table",
    },
    {
      _id: ids.foreignVipZone,
      venueId: ids.otherVenue,
      barId: ids.otherBar,
      name: "VIP",
      type: "vip_table",
    },
  ]);
  await Category.create([
    { _id: ids.drinks, venueId: ids.venue, name: "Italok", nameEn: "Drinks" },
    { _id: ids.bottles, venueId: ids.venue, name: "Palackok", sortOrder: 1 },
  ]);
  const item = {
    venueId: ids.venue,
    vatRate: 27 as const,
    categoryId: ids.drinks,
  };
  await Item.create([
    {
      ...item,
      _id: ids.gin,
      name: "Gin tonik",
      nameEn: "Gin and tonic",
      description: "Friss",
      priceHuf: 1990,
      sortOrder: 1,
    },
    {
      ...item,
      _id: ids.beer,
      name: "Csapolt sör",
      description: "Hideg",
      descriptionEn: "Cold",
      priceHuf: 1290,
      isAvailable: false,
    },
    {
      ...item,
      _id: ids.oldItem,
      name: "Régi koktél",
      priceHuf: 2490,
      archivedAt: now,
    },
    {
      ...item,
      _id: ids.vodka,
      categoryId: ids.bottles,
      name: "Vodka 0,7 l",
      priceHuf: 34900,
      vipOnly: true,
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

const itemIds = (menu: Awaited<ReturnType<typeof getPublicMenu>>) =>
  menu?.categories.flatMap((c) => c.items.map((i) => i.id));

const regular = { barId: ids.bar.toString(), isVip: false };

describe("resolveMenuContext", () => {
  const resolve = (zoneId?: string, barId?: string) =>
    resolveMenuContext({ slug: "demo", zoneId, barId });

  it("returns null for an unknown or unpublished venue", async () => {
    expect(await resolveMenuContext({ slug: "nope" })).toBeNull();
    expect(await resolveMenuContext({ slug: "draft" })).toBeNull();
  });

  it("grants VIP only for a VIP zone of this venue at the resolved bar", async () => {
    const vipZone = ids.vipZone.toString();

    expect(await resolve(vipZone)).toEqual({
      venueId: ids.venue.toString(),
      barId: ids.bar.toString(),
      isVip: true,
    });
    for (const zoneId of [
      undefined,
      ids.danceZone.toString(),
      ids.foreignVipZone.toString(),
      new Types.ObjectId().toString(),
    ]) {
      expect((await resolve(zoneId))?.isVip).toBe(false);
    }
    // A VIP zone of the main bar pasted next to another bar's QR id.
    expect(await resolve(vipZone, ids.terraceBar.toString())).toMatchObject({
      barId: ids.terraceBar.toString(),
      isVip: false,
    });
  });

  it("ignores a bar of another venue", async () => {
    const context = await resolve(undefined, ids.otherBar.toString());

    expect(context?.barId).toBe(ids.bar.toString());
  });
});

describe("getPublicMenu", () => {
  it("returns null for an unknown venue", async () => {
    expect(
      await getPublicMenu({ slug: "nope", locale: "hu", ...regular }),
    ).toBeNull();
  });

  it("lists items in display order without archived or VIP items", async () => {
    const menu = await getPublicMenu({
      slug: "demo",
      locale: "hu",
      ...regular,
    });

    expect(itemIds(menu)).toEqual([ids.beer.toString(), ids.gin.toString()]);
    expect(menu?.categories.map((c) => c.name)).toEqual(["Italok"]);
    expect(menu?.bar).toEqual({ id: ids.bar.toString(), name: "Főpult" });
    expect(menu?.categories[0]?.items[0]).toMatchObject({
      priceHuf: 1290,
      soldOut: true,
      imageUrl: null,
    });
  });

  it("adds the VIP items for a VIP context", async () => {
    const menu = await getPublicMenu({
      slug: "demo",
      locale: "hu",
      ...regular,
      isVip: true,
    });

    expect(itemIds(menu)).toContain(ids.vodka.toString());
  });

  it("falls back to Hungarian when the English text is empty", async () => {
    const menu = await getPublicMenu({
      slug: "demo",
      locale: "en",
      ...regular,
    });
    const [beer, gin] = menu?.categories[0]?.items ?? [];

    expect(menu?.categories[0]?.name).toBe("Drinks");
    expect(gin).toMatchObject({ name: "Gin and tonic", description: "Friss" });
    expect(beer).toMatchObject({ name: "Csapolt sör", description: "Cold" });
  });
});

describe("medianWaitMinutes", () => {
  it("hides the wait below three orders", () => {
    expect(medianWaitMinutes([])).toBeNull();
    expect(medianWaitMinutes([60_000, 120_000])).toBeNull();
  });

  it("takes the median, averaging the middle pair", () => {
    expect(medianWaitMinutes([9, 3, 4].map((m) => m * 60_000))).toBe(4);
    expect(medianWaitMinutes([2, 3, 5, 20].map((m) => m * 60_000))).toBe(4);
  });
});

describe("getVenueStatus", () => {
  beforeEach(async () => {
    await Order.collection.deleteMany({});
    await Bar.updateOne(
      { _id: ids.bar },
      { isOpen: true, $unset: { pausedUntil: 1 } },
    );
  });

  it("reports open, sold-out ids and no wait below three orders", async () => {
    await insertReadyOrder(20, 5);
    await insertReadyOrder(15, 7);
    const status = await getVenueStatus({ slug: "demo", now });

    expect(status).toEqual({
      status: "open",
      pausedUntil: null,
      estimatedWaitMinutes: null,
      soldOutItemIds: [ids.beer.toString()],
    });
  });

  it("estimates the wait from orders made ready in the last 30 minutes", async () => {
    await insertReadyOrder(20, 5);
    await insertReadyOrder(15, 7);
    await insertReadyOrder(12, 9);
    // Ready 50 minutes ago: outside the window.
    await insertReadyOrder(60, 10);
    const status = await getVenueStatus({ slug: "demo", now });

    expect(status?.estimatedWaitMinutes).toBe(7);
  });

  it("leaves out orders cancelled or refunded after they were ready", async () => {
    await insertReadyOrder(20, 5, "ready");
    await insertReadyOrder(15, 7, "expired");
    await insertReadyOrder(14, 25, "refunded");
    await insertReadyOrder(13, 25, "cancelled");

    const twoServed = await getVenueStatus({ slug: "demo", now });
    await insertReadyOrder(12, 9);
    const threeServed = await getVenueStatus({ slug: "demo", now });

    expect(twoServed?.estimatedWaitMinutes).toBeNull();
    expect(threeServed?.estimatedWaitMinutes).toBe(7);
  });

  it("reports paused and closed bars", async () => {
    const pausedUntil = new Date(now.getTime() + 10 * 60_000);
    await Bar.updateOne({ _id: ids.bar }, { pausedUntil });
    const paused = await getVenueStatus({ slug: "demo", now });
    await Bar.updateOne({ _id: ids.bar }, { isOpen: false });
    const closed = await getVenueStatus({ slug: "demo", now });
    const unknown = await getVenueStatus({ slug: "nope", now });

    expect(paused).toMatchObject({ status: "paused", pausedUntil });
    expect(closed?.status).toBe("closed");
    expect(unknown).toBeNull();
  });
});
