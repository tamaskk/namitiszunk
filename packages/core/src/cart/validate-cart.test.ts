import { Bar, connectDb, Item, Types, Venue, Zone } from "@namitiszunk/db";
import type { ValidateCartInput } from "@namitiszunk/validators";
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

import { validateCart } from "./validate-cart";

vi.mock("server-only", () => ({}));

const id = () => new Types.ObjectId();
const ids = {
  venue: id(),
  bar: id(),
  terrace: id(),
  dance: id(),
  vip: id(),
  category: id(),
  gin: id(),
  beer: id(),
  bottle: id(),
  terraceOnly: id(),
  old: id(),
  sizeGroup: id(),
  small: id(),
  large: id(),
  lime: id(),
};
const hex = (value: Types.ObjectId) => value.toHexString();

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_cart_test"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  // No maxItemsPerOrder: the default of 10 applies.
  await Venue.create({
    _id: ids.venue,
    slug: "demo",
    name: "Demo",
    status: "active",
  });
  await Bar.create([
    { _id: ids.bar, venueId: ids.venue, name: "Main", isOpen: true },
    { _id: ids.terrace, venueId: ids.venue, name: "Terrace", isOpen: true },
  ]);
  await Zone.create([
    { _id: ids.dance, venueId: ids.venue, barId: ids.bar, name: "Dance" },
    {
      _id: ids.vip,
      venueId: ids.venue,
      barId: ids.bar,
      name: "VIP",
      type: "vip_table",
    },
  ]);
  const base = {
    venueId: ids.venue,
    categoryId: ids.category,
    vatRate: 27 as const,
  };
  await Item.create([
    {
      ...base,
      _id: ids.gin,
      name: "Gin tonic",
      priceHuf: 2490,
      modifierGroups: [
        {
          name: "Extra",
          maxSelect: 1,
          modifiers: [{ _id: ids.lime, name: "Lime", priceDeltaHuf: 100 }],
        },
      ],
    },
    {
      ...base,
      _id: ids.beer,
      name: "Beer",
      priceHuf: 990,
      modifierGroups: [
        {
          _id: ids.sizeGroup,
          name: "Size",
          required: true,
          minSelect: 1,
          maxSelect: 1,
          modifiers: [
            { _id: ids.small, name: "0,3 l" },
            { _id: ids.large, name: "0,5 l", priceDeltaHuf: 400 },
          ],
        },
      ],
    },
    {
      ...base,
      _id: ids.bottle,
      name: "Bottle",
      priceHuf: 49900,
      vipOnly: true,
    },
    {
      ...base,
      _id: ids.terraceOnly,
      name: "Terrace spritz",
      priceHuf: 1990,
      barIds: [ids.terrace],
    },
    {
      ...base,
      _id: ids.old,
      name: "Old",
      priceHuf: 990,
      isAvailable: false,
      archivedAt: new Date("2026-11-01"),
    },
  ]);
});

type Line = ValidateCartInput["items"][number];
const gin: Line = {
  itemId: hex(ids.gin),
  quantity: 2,
  modifierIds: [hex(ids.lime)],
  unitPriceHuf: 2590,
};
const beer: Line = {
  itemId: hex(ids.beer),
  quantity: 1,
  modifierIds: [hex(ids.large)],
  unitPriceHuf: 1390,
};
const check = (
  items: Line[],
  extra: Partial<Omit<ValidateCartInput, "items">> = {},
) => validateCart({ slug: "demo", barId: hex(ids.bar), items, ...extra });

describe("validateCart", () => {
  it("passes a current cart with priced options", async () => {
    const result = await check([gin, beer]);

    expect(result).toEqual({
      problems: [],
      maxItemsPerOrder: 10,
      overLimit: false,
    });
  });

  it("flags an item sold out since it was added", async () => {
    await Item.updateOne({ _id: ids.gin }, { $set: { isAvailable: false } });

    const result = await check([beer, gin]);

    expect(result.problems).toEqual([
      { index: 1, itemId: hex(ids.gin), code: "sold_out" },
    ]);
  });

  it("flags an archived item and one that does not exist", async () => {
    const missing = hex(id());

    const result = await check([
      { itemId: hex(ids.old), quantity: 1, unitPriceHuf: 990 },
      { itemId: missing, quantity: 1, unitPriceHuf: 990 },
    ]);

    expect(result.problems).toEqual([
      { index: 0, itemId: hex(ids.old), code: "archived" },
      { index: 1, itemId: missing, code: "unavailable" },
    ]);
  });

  it("allows a VIP item only from a VIP zone", async () => {
    const bottle = {
      itemId: hex(ids.bottle),
      quantity: 1,
      unitPriceHuf: 49900,
    };

    const dance = await check([bottle], { zoneId: hex(ids.dance) });
    const vip = await check([bottle], { zoneId: hex(ids.vip) });

    expect(dance.problems).toEqual([
      { index: 0, itemId: hex(ids.bottle), code: "unavailable" },
    ]);
    expect(vip.problems).toEqual([]);
  });

  it("refuses an item limited to another bar", async () => {
    const line = {
      itemId: hex(ids.terraceOnly),
      quantity: 1,
      unitPriceHuf: 1990,
    };

    const main = await check([line]);
    const terrace = await check([line], { barId: hex(ids.terrace) });

    expect(main.problems).toMatchObject([{ code: "unavailable" }]);
    expect(terrace.problems).toEqual([]);
  });

  it("returns the new unit price when a price or surcharge changed", async () => {
    await Item.updateOne(
      { _id: ids.beer },
      {
        $set: {
          priceHuf: 1090,
          "modifierGroups.0.modifiers.1.priceDeltaHuf": 500,
        },
      },
    );

    const result = await check([gin, beer]);

    expect(result.problems).toEqual([
      {
        index: 1,
        itemId: hex(ids.beer),
        code: "price_changed",
        unitPriceHuf: 1590,
      },
    ]);
  });

  it("flags a missing required option and a modifier of another item", async () => {
    const result = await check([
      { ...beer, modifierIds: [] },
      { ...gin, modifierIds: [hex(ids.large)] },
    ]);

    expect(result.problems).toEqual([
      { index: 0, itemId: hex(ids.beer), code: "invalid_options" },
      { index: 1, itemId: hex(ids.gin), code: "invalid_options" },
    ]);
  });

  it("reports more than the default 10 items, and the venue's own limit", async () => {
    const eleven = await check([
      { ...gin, quantity: 10 },
      { ...beer, quantity: 1 },
    ]);
    await Venue.updateOne(
      { _id: ids.venue },
      { $set: { "orderRules.maxItemsPerOrder": 3 } },
    );
    const four = await check([{ ...gin, quantity: 4 }]);

    expect(eleven).toMatchObject({ overLimit: true, maxItemsPerOrder: 10 });
    expect(four).toMatchObject({ overLimit: true, maxItemsPerOrder: 3 });
  });

  it("throws NotFound for an unknown venue", async () => {
    await expect(
      validateCart({ slug: "nope", items: [gin] }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
