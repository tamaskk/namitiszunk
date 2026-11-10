import {
  AuditLog,
  Bar,
  Category,
  connectDb,
  Item,
  Order,
  Venue,
} from "@namitiszunk/db";
import type { ItemInput } from "@namitiszunk/validators";
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
import {
  archiveCategory,
  archiveMenuItem,
  createCategory,
  createItem,
  duplicateItem,
  getAdminMenu,
  reorderMenu,
  setItemAvailable,
  updateCategory,
  updateItem,
} from "./admin-menu";
import { getPublicMenu } from "./public-menu";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_admin_menu_test"));
  await Promise.all(
    [Venue, Bar, Category, Item, Order, AuditLog].map((m) =>
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

const member = (venueId: string, role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [{ venueId, memberId: new Types.ObjectId().toString(), role }],
});
const staff = (venueId: string, role: VenueRole): Actor => ({
  kind: "staff",
  venueId,
  memberId: new Types.ObjectId().toString(),
  role,
});

async function seed() {
  const [venue] = await Venue.create([
    { slug: "pilot", name: "Pilot", status: "active" },
  ]);
  const venueId = String(venue!._id);
  const [bar] = await Bar.create([{ venueId, name: "Főpult", isOpen: true }]);
  const manager = member(venueId, "manager");
  const { id: categoryId } = await createCategory(manager, venueId, {
    name: "Koktélok",
  });
  return { venueId, barId: String(bar!._id), manager, categoryId };
}

const gin = (categoryId: string): ItemInput => ({
  categoryId,
  name: "Gin tonic",
  priceHuf: 2500,
  vatRate: 27,
  allergens: ["sulphites"],
  modifierGroups: [
    {
      name: "Gin",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      modifiers: [
        { name: "Bombay", priceDeltaHuf: 300 },
        { name: "Hendrick's", priceDeltaHuf: 600 },
      ],
    },
  ],
});

const menuVersion = async (venueId: string) =>
  (await Venue.findById(venueId, { menuVersion: 1 }).lean())?.menuVersion;

describe("admin menu editing", () => {
  it("creates an item with options, audited, and raises the menu version", async () => {
    const { venueId, manager, categoryId } = await seed();
    const versionBefore = await menuVersion(venueId);

    const { id } = await createItem(manager, venueId, gin(categoryId));

    const menu = await getAdminMenu(manager, venueId);
    expect(menu.categories[0]!.items).toEqual([
      expect.objectContaining({
        id,
        name: "Gin tonic",
        priceHuf: 2500,
        allergens: ["sulphites"],
        modifierGroups: [expect.objectContaining({ name: "Gin" })],
      }),
    ]);
    expect(await menuVersion(venueId)).toBe((versionBefore ?? 0) + 1);
    expect(await AuditLog.countDocuments({ action: "menu.itemCreated" })).toBe(
      1,
    );
  });

  it("shows a new price on the guest menu after an update", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, gin(categoryId));

    await updateItem(manager, venueId, id, {
      ...gin(categoryId),
      priceHuf: 2700,
    });

    const guest = await getPublicMenu({
      slug: "pilot",
      locale: "hu",
      barId: null,
      isVip: false,
    });
    expect(guest!.categories[0]!.items[0]!.priceHuf).toBe(2700);
  });

  it("clears an optional field left empty in the form", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, {
      ...gin(categoryId),
      description: "Frissítő",
      alcoholPercent: 10,
    });

    await updateItem(manager, venueId, id, gin(categoryId));

    const item = await Item.findById(id).lean();
    expect(item).not.toHaveProperty("description");
    expect(item).not.toHaveProperty("alcoholPercent");
  });

  it("hides a VIP-only category's items from a plain QR, including items added later", async () => {
    const { venueId, manager, categoryId } = await seed();
    await createItem(manager, venueId, gin(categoryId));

    await updateCategory(manager, venueId, categoryId, {
      name: "Koktélok",
      vipOnly: true,
    });
    await createItem(manager, venueId, { ...gin(categoryId), name: "Negroni" });

    const plain = await getPublicMenu({
      slug: "pilot",
      locale: "hu",
      barId: null,
      isVip: false,
    });
    const vip = await getPublicMenu({
      slug: "pilot",
      locale: "hu",
      barId: null,
      isVip: true,
    });
    expect(plain!.categories).toEqual([]);
    expect(vip!.categories[0]!.items.map((i) => i.name)).toEqual([
      "Gin tonic",
      "Negroni",
    ]);
  });

  it("archives an item without touching the snapshot of a past order", async () => {
    const { venueId, barId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, gin(categoryId));
    const [order] = await Order.create([
      {
        venueId,
        barId,
        shortNumber: 1,
        businessDate: "2026-11-10",
        status: "picked_up",
        items: [
          {
            itemId: id,
            name: "Gin tonic",
            unitPriceHuf: 2500,
            quantity: 1,
            lineTotalHuf: 2500,
          },
        ],
        subtotalHuf: 2500,
        totalHuf: 2500,
        pickupCode: "K7Q",
        guestTokenHash: "a".repeat(64),
        acceptedTermsVersion: "2026-11-01",
      },
    ]);

    await archiveMenuItem(manager, venueId, id);

    const menu = await getAdminMenu(manager, venueId);
    const stored = await Order.findById(order!._id).lean();
    expect(menu.categories[0]!.items).toEqual([]);
    expect(stored!.items[0]).toMatchObject({
      name: "Gin tonic",
      unitPriceHuf: 2500,
    });
    expect(await Item.findById(id).lean()).toHaveProperty("archivedAt");
  });

  it("refuses to archive a category that still has live items", async () => {
    const { venueId, manager, categoryId } = await seed();
    await createItem(manager, venueId, gin(categoryId));

    const archive = archiveCategory(manager, venueId, categoryId);

    await expect(archive).rejects.toMatchObject({
      code: "category_not_empty",
    });
  });

  it("puts a duplicate right below the original", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id: first } = await createItem(manager, venueId, gin(categoryId));
    await createItem(manager, venueId, { ...gin(categoryId), name: "Mojito" });

    await duplicateItem(manager, venueId, first, (n) => `${n} (másolat)`);

    const names = (
      await getAdminMenu(manager, venueId)
    ).categories[0]!.items.map((i) => i.name);
    expect(names).toEqual(["Gin tonic", "Gin tonic (másolat)", "Mojito"]);
  });

  it("reorders items and refuses a stale list", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id: a } = await createItem(manager, venueId, gin(categoryId));
    const { id: b } = await createItem(manager, venueId, {
      ...gin(categoryId),
      name: "Mojito",
    });

    await reorderMenu(manager, venueId, { kind: "items", categoryId }, [b, a]);
    const stale = reorderMenu(manager, venueId, { kind: "items", categoryId }, [
      a,
    ]);

    await expect(stale).rejects.toMatchObject({ code: "menu_changed" });
    const names = (
      await getAdminMenu(manager, venueId)
    ).categories[0]!.items.map((i) => i.name);
    expect(names).toEqual(["Mojito", "Gin tonic"]);
  });

  it("keeps an item sold out when an older form is saved", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, gin(categoryId));
    const openedForm = { ...gin(categoryId), isAvailable: true };
    await setItemAvailable(manager, venueId, id, false);

    await updateItem(manager, venueId, id, { ...openedForm, priceHuf: 2600 });

    const item = await Item.findById(id).lean();
    expect(item).toMatchObject({ priceHuf: 2600, isAvailable: false });
  });

  it("shows a category's items to every QR again when VIP only is turned off", async () => {
    const { venueId, manager, categoryId } = await seed();
    await updateCategory(manager, venueId, categoryId, {
      name: "Koktélok",
      vipOnly: true,
    });
    await createItem(manager, venueId, gin(categoryId));

    await updateCategory(manager, venueId, categoryId, {
      name: "Koktélok",
      vipOnly: false,
    });

    const plain = await getPublicMenu({
      slug: "pilot",
      locale: "hu",
      barId: null,
      isVip: false,
    });
    expect(plain!.categories[0]!.items.map((i) => i.name)).toEqual([
      "Gin tonic",
    ]);
  });

  it("reorders categories", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id: beers } = await createCategory(manager, venueId, {
      name: "Sörök",
    });

    await reorderMenu(manager, venueId, { kind: "categories" }, [
      beers,
      categoryId,
    ]);

    const names = (await getAdminMenu(manager, venueId)).categories.map(
      (c) => c.name,
    );
    expect(names).toEqual(["Sörök", "Koktélok"]);
  });

  it("moves an item to the end of another category and takes its VIP flag", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id: vip } = await createCategory(manager, venueId, {
      name: "VIP palackok",
      vipOnly: true,
    });
    await createItem(manager, venueId, { ...gin(vip), name: "Moët" });
    const { id } = await createItem(manager, venueId, gin(categoryId));

    await updateItem(manager, venueId, id, gin(vip));

    const menu = await getAdminMenu(manager, venueId);
    const vipCategory = menu.categories.find((c) => c.id === vip)!;
    expect(vipCategory.items.map((i) => i.name)).toEqual(["Moët", "Gin tonic"]);
    expect(await Item.findById(id).lean()).toMatchObject({ vipOnly: true });
  });

  it("leaves the menu version alone when sold out does not change", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, gin(categoryId));
    const versionBefore = await menuVersion(venueId);

    await setItemAvailable(manager, venueId, id, true);

    expect(await menuVersion(venueId)).toBe(versionBefore);
  });

  it("keeps a duplicate's name within the name limit", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, {
      ...gin(categoryId),
      name: "G".repeat(100),
    });

    const { id: copyId } = await duplicateItem(
      manager,
      venueId,
      id,
      (n) => `${n} (másolat)`,
    );

    const copy = await Item.findById(copyId).lean();
    expect(copy!.name).toHaveLength(100);
    expect(copy!.name.endsWith("… (másolat)")).toBe(true);
  });

  it("refuses an image that was not uploaded for this venue", async () => {
    const { venueId, manager, categoryId } = await seed();
    const otherVenue = new Types.ObjectId().toString();
    const foreignImage = `https://abc123.public.blob.vercel-storage.com/venues/${otherVenue}/product/0b6f8a3e-4c1d-4f5a-9b2e-7d3c1a2b4e5f`;

    const create = createItem(manager, venueId, {
      ...gin(categoryId),
      imageUrl: foreignImage,
    });

    await expect(create).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
    });
  });

  it("refuses a bar of another venue", async () => {
    const { venueId, manager, categoryId } = await seed();
    const foreignBar = new Types.ObjectId().toString();

    const create = createItem(manager, venueId, {
      ...gin(categoryId),
      barIds: [foreignBar],
    });

    await expect(create).rejects.toMatchObject({ status: 404 });
  });
});

describe("menu permissions", () => {
  it("refuses menu edits from a bartender's PIN but lets them mark an item sold out", async () => {
    const { venueId, manager, categoryId } = await seed();
    const { id } = await createItem(manager, venueId, gin(categoryId));
    const bartender = staff(venueId, "bartender");

    const edit = updateItem(bartender, venueId, id, {
      ...gin(categoryId),
      priceHuf: 1,
    });
    await expect(edit).rejects.toMatchObject({ status: 403 });
    await setItemAvailable(bartender, venueId, id, false);

    const item = await Item.findById(id).lean();
    expect(item).toMatchObject({ priceHuf: 2500, isAvailable: false });
  });

  it("refuses a member of another venue", async () => {
    const { venueId, categoryId } = await seed();
    const stranger = member(new Types.ObjectId().toString(), "owner");

    const create = createItem(stranger, venueId, gin(categoryId));

    await expect(create).rejects.toMatchObject({ status: 403 });
  });
});
