import { AuditLog, Category, connectDb, Item, Venue } from "@namitiszunk/db";
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
import { createCategory, createItem, getAdminMenu } from "./admin-menu";
import { importMenu, parseMenuCsv, previewMenuImport } from "./menu-import";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_menu_import_test"));
  await Promise.all(
    [Venue, Category, Item, AuditLog].map((m) => m.createCollection()),
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

async function seed() {
  const [venue] = await Venue.create([
    { slug: "pilot", name: "Pilot", status: "active" },
  ]);
  const venueId = String(venue!._id);
  return { venueId, manager: member(venueId, "manager") };
}

const header =
  "kategoria;nev;nev_en;leiras;leiras_en;ar;afa;alkohol;allergenek;csak_vip";
// What a Hungarian Excel writes with "CSV UTF-8": a BOM, semicolons, decimal commas.
const excelCsv = [
  `\uFEFF${header}`,
  "Koktélok;Gin tonic;;Frissítő;;2 500 Ft;27%;10,5;Kén-dioxid és szulfitok;",
  "Koktélok;Mojito;;;;2400;27;12;;nem",
  "Üdítők;Kóla;Coke;;;900;27;;;",
].join("\r\n");

describe("parseMenuCsv", () => {
  it("reads a semicolon CSV from a Hungarian Excel with BOM and decimal commas", () => {
    const { rows, problems } = parseMenuCsv(excelCsv);

    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      category: "Koktélok",
      item: {
        name: "Gin tonic",
        description: "Frissítő",
        priceHuf: 2500,
        vatRate: 27,
        alcoholPercent: 10.5,
        allergens: ["sulphites"],
      },
    });
    expect(rows[2]!.item).toMatchObject({ name: "Kóla", nameEn: "Coke" });
  });

  it("reports the file line after a blank line and a cell spanning two lines", () => {
    const csv = [
      header,
      "",
      'Koktélok;Gin tonic;;"Frissítő,\nhideg";;2500;27;;;',
      "Koktélok;Mojito;;;;0x1b;27;1e1;;",
    ].join("\n");

    const { problems } = parseMenuCsv(csv);

    expect(problems).toEqual([
      { line: 5, column: "ar", key: "validation.huf.integer" },
      { line: 5, column: "alkohol", key: "validation.invalid" },
    ]);
  });

  it("accepts headers with accents and capitals", () => {
    const csv = "Kategória;Név;Ár;ÁFA\nÜdítők;Kóla;900;27";

    const { rows, problems } = parseMenuCsv(csv);

    expect(problems).toEqual([]);
    expect(rows[0]!.item).toMatchObject({ name: "Kóla", priceHuf: 900 });
  });

  it("reads a comma CSV with a quoted comma and line break in a cell", () => {
    const csv = [
      "kategoria,nev,leiras,ar,afa,allergenek",
      'Sörök,Csapolt,"Világos, 0,5 l\nhideg",900,27,"gluten, Milk"',
    ].join("\n");

    const { rows, problems } = parseMenuCsv(csv);

    expect(problems).toEqual([]);
    expect(rows[0]!.item).toMatchObject({
      description: "Világos, 0,5 l\nhideg",
      allergens: ["gluten", "milk"],
    });
  });

  it("reports each bad cell with its line and column", () => {
    const csv = [
      header,
      "Koktélok;Gin tonic;;;;két ezer;27;;;",
      "Koktélok;Mojito;;;;2400;20;;tej, diófélék;",
      "Koktélok;Negroni;;;;2400;27;;Zeller, csoki;talán",
    ].join("\n");

    const { problems } = parseMenuCsv(csv);

    expect(problems).toEqual([
      { line: 2, column: "ar", key: "validation.huf.integer" },
      { line: 3, column: "afa", key: "validation.vatRate.invalid" },
      { line: 4, column: "allergenek", key: "unknownAllergen", value: "csoki" },
      { line: 4, column: "csak_vip", key: "invalidYesNo", value: "talán" },
    ]);
  });

  it("refuses a file without the required columns", () => {
    const { rows, problems } = parseMenuCsv("nev;ar\nKóla;900");

    expect(rows).toEqual([]);
    expect(problems).toEqual([
      {
        line: 1,
        column: null,
        key: "missingColumns",
        value: "kategoria, afa",
      },
    ]);
  });
});

describe("menu import", () => {
  it("creates missing categories and items, audited, and raises the menu version", async () => {
    const { venueId, manager } = await seed();

    const result = await importMenu(manager, venueId, excelCsv);

    expect(result).toEqual({ created: 3, skipped: 0, categoriesCreated: 2 });
    const menu = await getAdminMenu(manager, venueId);
    expect(
      menu.categories.map((c) => [c.name, c.items.map((i) => i.name)]),
    ).toEqual([
      ["Koktélok", ["Gin tonic", "Mojito"]],
      ["Üdítők", ["Kóla"]],
    ]);
    expect(await AuditLog.countDocuments({ action: "menu.imported" })).toBe(1);
    expect((await Venue.findById(venueId).lean())!.menuVersion).toBe(1);
  });

  it("adds to an existing category and skips a same-name item without overwriting it", async () => {
    const { venueId, manager } = await seed();
    const { id: categoryId } = await createCategory(manager, venueId, {
      name: "koktélok",
    });
    await createItem(manager, venueId, {
      categoryId,
      name: "Gin Tonic",
      priceHuf: 2000,
      vatRate: 27,
    });

    const preview = await previewMenuImport(manager, venueId, excelCsv);
    const result = await importMenu(manager, venueId, excelCsv);

    expect(preview.rows.map((r) => r.status)).toEqual([
      "duplicate",
      "new",
      "new",
    ]);
    expect(preview.newCategories).toEqual([{ name: "Üdítők", vipOnly: false }]);
    expect(result).toEqual({ created: 2, skipped: 1, categoriesCreated: 1 });
    const gin = await Item.findOne({ venueId, name: "Gin Tonic" }).lean();
    expect(gin!.priceHuf).toBe(2000);
  });

  it("makes a new category VIP only and hides its items from a plain QR", async () => {
    const { venueId, manager } = await seed();
    const csv = [
      header,
      "VIP palackok;Moët;;;;45000;27;12;;igen",
      "VIP palackok;Hennessy;;;;60000;27;40;;",
    ].join("\n");

    await importMenu(manager, venueId, csv);

    expect(await Category.findOne({ venueId }).lean()).toMatchObject({
      vipOnly: true,
    });
    expect(await Item.countDocuments({ venueId, vipOnly: true })).toBe(2);
  });

  it("refuses VIP flags that disagree within the file or with the menu", async () => {
    const { venueId, manager } = await seed();
    await createCategory(manager, venueId, { name: "Sörök" });
    const csv = [
      header,
      "Koktélok;Gin tonic;;;;2500;27;;;igen",
      "Koktélok;Mojito;;;;2400;27;;;nem",
      "Sörök;Csapolt;;;;900;27;;;igen",
    ].join("\n");

    const preview = await previewMenuImport(manager, venueId, csv);

    expect(preview.problems).toEqual([
      { line: 3, column: "csak_vip", key: "vipMismatch", value: "2" },
      { line: 4, column: "csak_vip", key: "vipConflict", value: "Sörök" },
    ]);
  });

  it("imports nothing from a file with a problem", async () => {
    const { venueId, manager } = await seed();
    const csv = [
      header,
      "Koktélok;Gin tonic;;;;2500;27;;;",
      "Koktélok;Gin tonic;;;;2600;27;;;",
    ].join("\n");

    const attempt = importMenu(manager, venueId, csv);

    await expect(attempt).rejects.toMatchObject({
      status: 400,
      code: "import_has_errors",
    });
    expect(await Category.countDocuments()).toBe(0);
    expect(await Item.countDocuments()).toBe(0);
  });

  it("leaves no half menu behind when the import fails midway", async () => {
    const { venueId, manager } = await seed();
    vi.spyOn(Item, "insertMany").mockRejectedValueOnce(new Error("network"));

    const attempt = importMenu(manager, venueId, excelCsv);

    await expect(attempt).rejects.toThrow("network");
    expect(await Category.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
    expect((await Venue.findById(venueId).lean())!.menuVersion ?? 0).toBe(0);
  });

  it("reports a negative price with its line", async () => {
    const { venueId, manager } = await seed();
    const csv = `${header}\nKoktélok;Gin tonic;;;;-500;27;;;`;

    const preview = await previewMenuImport(manager, venueId, csv);

    expect(preview.problems).toEqual([
      { line: 2, column: "ar", key: "validation.huf.integer" },
    ]);
  });

  it("writes nothing and keeps the menu version when every row already exists", async () => {
    const { venueId, manager } = await seed();
    await importMenu(manager, venueId, excelCsv);

    const again = await importMenu(manager, venueId, excelCsv);

    expect(again).toEqual({ created: 0, skipped: 3, categoriesCreated: 0 });
    expect(await AuditLog.countDocuments({ action: "menu.imported" })).toBe(1);
    expect((await Venue.findById(venueId).lean())!.menuVersion).toBe(1);
  });

  it("sends at most 100 problems back for a file full of bad cells", async () => {
    const { venueId, manager } = await seed();
    const csv = `${header}\nKoktélok;Gin;;;;2500;27;;${"x,".repeat(300)};`;

    const preview = await previewMenuImport(manager, venueId, csv);

    expect(preview.problemCount).toBe(300);
    expect(preview.problems).toHaveLength(100);
  });

  it("refuses a bartender", async () => {
    const { venueId } = await seed();

    const attempt = importMenu(member(venueId, "bartender"), venueId, excelCsv);

    await expect(attempt).rejects.toMatchObject({ status: 403 });
  });
});
