import {
  AuditLog,
  Bar,
  connectDb,
  Order,
  type OrderStatus,
  Payment,
  QrCode,
  RateLimit,
  Refund,
  Venue,
  VenueMember,
  Zone,
} from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import Papa from "papaparse";
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
import { businessDate } from "../orders/business-date";
import {
  type ExportLabels,
  exportColumns,
  exportVenueOrders,
} from "../orders/admin-orders";
import {
  bartenderStats,
  durationText,
  percentChange,
  summarizeOrders,
  waitTimeTrend,
} from "./aggregations";
import {
  exportReport,
  getBartenderReport,
  getDailyReport,
  getPeriodReport,
  type ReportExportLabels,
} from "./reports";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_reports_test"));
  await Promise.all(
    [
      Venue,
      Bar,
      Zone,
      QrCode,
      Order,
      Payment,
      Refund,
      RateLimit,
      VenueMember,
      AuditLog,
    ].map((m) => m.createCollection()),
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

const clock = { timezone: "Europe/Budapest", businessDayStart: "06:00" };
// Friday 2026-11-13 is the business day under test; Budapest is UTC+1 in November.
const FRIDAY = "2026-11-13";
const beer = { itemId: new Types.ObjectId(), name: "Sör", unitPriceHuf: 1200 };
const shot = {
  itemId: new Types.ObjectId(),
  name: "Unicum",
  unitPriceHuf: 300,
};
const cocktail = {
  itemId: new Types.ObjectId(),
  name: "Mojito",
  nameEn: "Mojito EN",
  unitPriceHuf: 2500,
};
const line = (item: typeof beer, quantity: number) => ({
  ...item,
  quantity,
  lineTotalHuf: item.unitPriceHuf * quantity,
});

async function seedVenue() {
  const venueId = new Types.ObjectId();
  await Venue.create({ _id: venueId, slug: `club-${venueId}`, name: "Club" });
  const bar = await Bar.create({ venueId, name: "Főpult" });
  const zone = await Zone.create({
    venueId,
    barId: bar._id,
    name: "Terasz",
    type: "bar_area",
  });
  const qr = await QrCode.create({
    venueId,
    barId: bar._id,
    zoneId: zone._id,
    code: `terasz-${String(venueId).slice(-6)}`,
  });
  const [bence, dora, owner, manager] = await VenueMember.create([
    { venueId, role: "bartender", displayName: "Bence" },
    { venueId, role: "bartender", displayName: "Dóra" },
    { venueId, role: "owner", displayName: "Anna" },
    { venueId, role: "manager", displayName: "Péter" },
  ]);
  const actorOf = (
    member: NonNullable<typeof bence>,
    role: "bartender" | "owner" | "manager",
  ): Actor => ({
    kind: "staff",
    venueId: String(venueId),
    memberId: String(member._id),
    role,
  });
  return {
    venueId: String(venueId),
    barId: bar._id,
    qrId: qr._id,
    bence: bence!,
    dora: dora!,
    owner: actorOf(owner!, "owner"),
    manager: actorOf(manager!, "manager"),
    bartender: actorOf(bence!, "bartender"),
  };
}
type Seeded = Awaited<ReturnType<typeof seedVenue>>;

let shortNumber = 0;
const minutes = (date: Date, n: number) =>
  new Date(date.getTime() + n * 60_000);

/** A paid order whose business day comes from its payment time, as transition() stores it. */
async function paidOrder(
  s: Seeded,
  paidAt: Date,
  fields: {
    status: OrderStatus;
    items: ReturnType<typeof line>[];
    tipHuf?: number;
    readyAfter?: number;
    pickedUpAfter?: number;
    qr?: boolean;
  },
) {
  shortNumber += 1;
  const subtotalHuf = fields.items.reduce((sum, l) => sum + l.lineTotalHuf, 0);
  const tipHuf = fields.tipHuf ?? 0;
  const readyAt =
    fields.readyAfter === undefined
      ? undefined
      : minutes(paidAt, fields.readyAfter);
  return Order.create({
    venueId: s.venueId,
    barId: s.barId,
    shortNumber,
    businessDate: businessDate(paidAt, clock),
    status: fields.status,
    items: fields.items,
    subtotalHuf,
    tipHuf,
    totalHuf: subtotalHuf + tipHuf,
    pickupCode: "K7Q",
    guestTokenHash: new Types.ObjectId().toHexString(),
    acceptedTermsVersion: "draft-2026-11",
    paidAt,
    readyAt,
    pickedUpAt:
      readyAt && fields.pickedUpAfter !== undefined
        ? minutes(readyAt, fields.pickedUpAfter)
        : undefined,
    ...(fields.qr ? { qrCodeId: s.qrId } : {}),
  });
}

async function log(
  member: { _id: Types.ObjectId },
  action: string,
  orderId: Types.ObjectId,
  at: Date,
) {
  await AuditLog.create({
    actor: { type: "venue_member", id: member._id },
    action,
    target: { type: "order", id: orderId },
    createdAt: at,
  });
}

/**
 * Friday night: A 22:10, D 23:00, C 23:30 (refunded), B 02:00 Saturday (still Friday's business day);
 * E 07:00 Saturday belongs to Saturday. Plus an unpaid order and another venue's order.
 */
async function friday(s: Seeded) {
  const a = await paidOrder(s, new Date("2026-11-13T21:10:00Z"), {
    status: "picked_up",
    items: [line(beer, 2), line(shot, 1)],
    tipHuf: 300,
    readyAfter: 4,
    pickedUpAfter: 2,
    qr: true,
  });
  const b = await paidOrder(s, new Date("2026-11-14T01:00:00Z"), {
    status: "picked_up",
    items: [line(cocktail, 2)],
    readyAfter: 10,
    pickedUpAfter: 1,
    qr: true,
  });
  const c = await paidOrder(s, new Date("2026-11-13T22:30:00Z"), {
    status: "refunded",
    items: [line(beer, 1), line(shot, 1)],
  });
  await Refund.create({
    venueId: s.venueId,
    paymentId: new Types.ObjectId(),
    orderId: c._id,
    amountHuf: 1500,
    reason: "Elfogyott",
    initiatedBy: { type: "system" },
    status: "succeeded",
  });
  const d = await paidOrder(s, new Date("2026-11-13T22:00:00Z"), {
    status: "expired",
    items: [line(cocktail, 1)],
    tipHuf: 200,
    readyAfter: 6,
  });
  const e = await paidOrder(s, new Date("2026-11-14T06:00:00Z"), {
    status: "new",
    items: [line(beer, 1)],
  });
  await Order.create({
    venueId: s.venueId,
    barId: s.barId,
    businessDate: FRIDAY,
    status: "awaiting_payment",
    items: [line(beer, 5)],
    subtotalHuf: 6000,
    totalHuf: 6000,
    pickupCode: "AAA",
    guestTokenHash: new Types.ObjectId().toHexString(),
    acceptedTermsVersion: "draft-2026-11",
  });
  const other = await seedVenue();
  await paidOrder(other, new Date("2026-11-13T21:30:00Z"), {
    status: "picked_up",
    items: [line(beer, 9)],
  });
  return { a, b, c, d, e };
}

describe("daily report", () => {
  it("counts a 22:00–04:00 night on one business day, with exact forints, median and pickup time", async () => {
    const s = await seedVenue();
    await friday(s);

    const report = await getDailyReport(s.manager, s.venueId, FRIDAY);

    expect(report.businessDate).toBe(FRIDAY);
    expect(report.summary).toEqual({
      orders: 4,
      // (3000 − 300) + 5000 + 1500 + (2700 − 200)
      revenueHuf: 11_700,
      tipHuf: 500,
      avgBasketHuf: 2925,
      // 4, 10 and 6 minutes
      avgPrepSeconds: 400,
      medianPrepSeconds: 360,
      avgPickupSeconds: 90,
      refundedOrders: 1,
      refundedHuf: 1500,
      expiredOrders: 1,
    });
  });

  it("lists the hours in the order of the night, 02:00 after 23:00", async () => {
    const s = await seedVenue();
    await friday(s);

    const { hours } = await getDailyReport(s.owner, s.venueId, FRIDAY);

    expect(
      hours.map((h) => [h.label, h.orders, h.items, h.revenueHuf, h.tipHuf]),
    ).toEqual([
      ["22:00", 1, 3, 2700, 300],
      ["23:00", 2, 3, 4000, 200],
      ["02:00", 1, 2, 5000, 0],
    ]);
  });

  it("ranks products by quantity, then revenue, with whole-forint revenue", async () => {
    const s = await seedVenue();
    await friday(s);

    const { products } = await getDailyReport(s.owner, s.venueId, FRIDAY);

    expect(
      products.map((p) => [p.name, p.quantity, p.orders, p.revenueHuf]),
    ).toEqual([
      ["Mojito", 3, 2, 7500],
      ["Sör", 3, 2, 3600],
      ["Unicum", 2, 2, 600],
    ]);
    expect(products[0]?.nameEn).toBe("Mojito EN");
  });

  it("defaults to the venue's current business day: 02:00 is still the evening before", async () => {
    const s = await seedVenue();
    await friday(s);

    const report = await getDailyReport(
      s.manager,
      s.venueId,
      undefined,
      new Date("2026-11-14T01:30:00Z"),
    );

    expect(report.businessDate).toBe(FRIDAY);
    expect(report.summary.orders).toBe(4);
  });

  it("keeps a DST night on one business day and its 02:00 hours together", async () => {
    const s = await seedVenue();
    // 2026-10-25: 02:30 CEST (00:30Z) and, after the clocks go back, 02:30 CET (01:30Z).
    for (const at of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"])
      await paidOrder(s, new Date(at), {
        status: "picked_up",
        items: [line(beer, 1)],
      });

    const report = await getDailyReport(s.owner, s.venueId, "2026-10-24");

    expect(report.summary.orders).toBe(2);
    expect(report.hours.map((h) => [h.label, h.orders])).toEqual([
      ["02:00", 2],
    ]);
  });

  it("matches the Orders export of the same day (T-056)", async () => {
    const s = await seedVenue();
    await friday(s);
    const labels: ExportLabels = {
      columns: Object.fromEntries(
        exportColumns.map((c) => [c, c]),
      ) as ExportLabels["columns"],
      status: new Proxy(
        {},
        { get: (_, key) => String(key) },
      ) as ExportLabels["status"],
      methods: { card: "card" },
      filename: "orders",
      sheet: "Orders",
    };

    const [summary, file] = await Promise.all([
      summarizeOrders(s.venueId, { from: FRIDAY, to: FRIDAY }),
      exportVenueOrders(
        s.owner,
        s.venueId,
        { from: FRIDAY, to: FRIDAY, format: "csv" },
        labels,
      ),
    ]);

    const rows = Papa.parse<Record<string, string>>(
      // TextDecoder drops the BOM the CSV starts with.
      new TextDecoder().decode(file.body),
      { header: true, delimiter: ";", skipEmptyLines: true },
    ).data;
    const sum = (column: string) =>
      rows.reduce((total, row) => total + Number(row[column]), 0);
    expect(rows).toHaveLength(summary.orders);
    expect(sum("totalHuf") - sum("tipHuf")).toBe(summary.revenueHuf);
    expect(sum("tipHuf")).toBe(summary.tipHuf);
    expect(sum("refundedHuf")).toBe(summary.refundedHuf);
  });
});

describe("period report", () => {
  it("breaks Friday and Saturday down by day, bar, QR source and weekday × hour, and compares periods", async () => {
    const s = await seedVenue();
    await friday(s);

    const report = await getPeriodReport(
      s.owner,
      s.venueId,
      { from: FRIDAY, to: "2026-11-14" },
      { from: "2026-11-14", to: "2026-11-14" },
    );

    expect(report.days.map((d) => [d.key, d.orders, d.revenueHuf])).toEqual([
      [FRIDAY, 4, 11_700],
      ["2026-11-14", 1, 1200],
    ]);
    expect(report.bars.map((b) => [b.label, b.orders])).toEqual([
      ["Főpult", 5],
    ]);
    expect(
      report.qrSources.map((q) => [
        q.key === "none" ? "none" : q.label,
        q.orders,
      ]),
    ).toEqual([
      ["none", 3],
      [expect.stringMatching(/^Terasz \(terasz-/), 2],
    ]);
    // Friday = 5, Saturday = 6 (ISO); the 02:00 order counts on Friday's business day.
    expect(report.heatmap).toEqual([
      { weekday: 5, hour: 2, orders: 1 },
      { weekday: 5, hour: 22, orders: 1 },
      { weekday: 5, hour: 23, orders: 2 },
      { weekday: 6, hour: 7, orders: 1 },
    ]);
    expect(report.summary.revenueHuf).toBe(12_900);
    expect(report.comparison?.summary.orders).toBe(1);
    expect(
      percentChange(report.summary.orders, report.comparison!.summary.orders),
    ).toBe(400);
  });

  it("is the Owner's: a manager and a bartender are refused", async () => {
    const s = await seedVenue();
    const range = { from: FRIDAY, to: FRIDAY };

    await expect(
      getPeriodReport(s.manager, s.venueId, range),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      getBartenderReport(s.manager, s.venueId, range),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      getDailyReport(s.bartender, s.venueId, FRIDAY),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      getDailyReport(s.owner, new Types.ObjectId().toHexString(), FRIDAY),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns nothing but zeros for a night without orders", async () => {
    const s = await seedVenue();

    const report = await getPeriodReport(s.owner, s.venueId, {
      from: FRIDAY,
      to: FRIDAY,
    });

    expect(report.summary.orders).toBe(0);
    expect(report.summary.avgPrepSeconds).toBeNull();
    expect(report.days).toEqual([]);
    expect(report.heatmap).toEqual([]);
  });
});

describe("bartender report", () => {
  it("gives Ready orders, orders per active hour, Preparing → Ready and the tip to whoever marked Ready", async () => {
    const s = await seedVenue();
    const { a, b, d } = await friday(s);
    await log(
      s.bence,
      "order.start_preparing",
      a._id,
      new Date("2026-11-13T21:11:00Z"),
    );
    await log(
      s.bence,
      "order.mark_ready",
      a._id,
      new Date("2026-11-13T21:14:00Z"),
    );
    await log(s.dora, "order.pick_up", a._id, new Date("2026-11-13T21:16:00Z"));
    await log(
      s.dora,
      "order.start_preparing",
      d._id,
      new Date("2026-11-13T22:02:00Z"),
    );
    await log(
      s.dora,
      "order.mark_ready",
      d._id,
      new Date("2026-11-13T22:06:00Z"),
    );
    await log(
      s.dora,
      "order.start_preparing",
      b._id,
      new Date("2026-11-14T01:02:00Z"),
    );
    await log(
      s.bence,
      "order.mark_ready",
      b._id,
      new Date("2026-11-14T01:10:00Z"),
    );
    // A manager's web action is not a PIN holder's and stays out.
    await AuditLog.create({
      actor: { type: "user", id: new Types.ObjectId() },
      action: "order.mark_ready",
      target: { type: "order", id: a._id },
    });

    const rows = await getBartenderReport(s.owner, s.venueId, {
      from: FRIDAY,
      to: FRIDAY,
    });

    expect(rows).toEqual([
      {
        memberId: String(s.bence._id),
        name: "Bence",
        readyOrders: 2,
        // 21:11 → 01:10
        activeSeconds: 14_340,
        ordersPerHour: 0.5,
        // 3 and 8 minutes
        avgPrepToReadySeconds: 330,
        tipHuf: 300,
      },
      {
        memberId: String(s.dora._id),
        name: "Dóra",
        readyOrders: 1,
        // 21:16 → 01:02
        activeSeconds: 13_560,
        ordersPerHour: 0.3,
        avgPrepToReadySeconds: 240,
        tipHuf: 200,
      },
    ]);
  });

  it("gives no orders per hour for a single action", async () => {
    const s = await seedVenue();
    const { a } = await friday(s);
    await log(
      s.bence,
      "order.mark_ready",
      a._id,
      new Date("2026-11-13T21:14:00Z"),
    );

    const [row] = await bartenderStats(s.venueId, { from: FRIDAY, to: FRIDAY });

    expect(row).toMatchObject({
      readyOrders: 1,
      ordersPerHour: null,
      avgPrepToReadySeconds: null,
      tipHuf: 300,
    });
  });
});

describe("wait time trend (dashboard)", () => {
  it("averages payment → Ready in 15-minute buckets over 3 hours, counting waiting orders until now", async () => {
    const s = await seedVenue();
    await friday(s);
    await paidOrder(s, new Date("2026-11-13T22:35:00Z"), {
      status: "new",
      items: [line(beer, 1)],
    });

    const buckets = await waitTimeTrend(
      s.venueId,
      new Date("2026-11-13T22:40:00Z"),
    );

    expect(buckets).toHaveLength(12);
    expect(buckets[0]?.start).toEqual(new Date("2026-11-13T19:45:00Z"));
    expect(
      buckets
        .map((b, i) => [i, b.orders, b.avgWaitSeconds])
        .filter(([, orders]) => orders !== 0),
    ).toEqual([
      [5, 1, 240],
      [9, 1, 360],
      // The refunded order (22:30) has no wait; the new one (22:35) waits 5 minutes so far.
      [11, 2, 300],
    ]);
  });
});

describe("export", () => {
  const labels: ReportExportLabels = {
    columns: new Proxy(
      {},
      { get: (_, key) => String(key) },
    ) as ReportExportLabels["columns"],
    sections: {
      day: "Nap",
      hour: "Óra",
      heatmap: "Hőtérkép",
      product: "Termék",
      bar: "Pult",
      qr: "QR",
    },
    weekdays: ["H", "K", "Sze", "Cs", "P", "Szo", "V"],
    noQr: "Nincs QR",
    english: false,
    filename: "riport",
    sheet: "Riport",
  };
  const csvRows = (body: Uint8Array) =>
    Papa.parse<string[]>(new TextDecoder().decode(body), {
      delimiter: ";",
      skipEmptyLines: true,
    }).data;

  it("writes the daily figures one row per business day", async () => {
    const s = await seedVenue();
    await friday(s);

    const file = await exportReport(
      s.manager,
      s.venueId,
      "daily",
      { from: FRIDAY, to: "2026-11-14", format: "csv" },
      labels,
    );

    const [header, ...rows] = csvRows(file.body);
    expect(file.filename).toBe(`riport-${FRIDAY}_2026-11-14.csv`);
    expect(header?.[0]).toBe("businessDate");
    expect(rows).toEqual([
      [
        FRIDAY,
        "4",
        "11700",
        "500",
        "2925",
        "6:40",
        "6:00",
        "1:30",
        "1",
        "1500",
        "1",
      ],
      ["2026-11-14", "1", "1200", "0", "1200", "–", "–", "–", "0", "0", "0"],
    ]);
  });

  it("writes the period breakdowns and the bartender table, and refuses them to a manager", async () => {
    const s = await seedVenue();
    await friday(s);
    const range = { from: FRIDAY, to: FRIDAY, format: "csv" as const };

    const period = csvRows(
      (await exportReport(s.owner, s.venueId, "period", range, labels)).body,
    );
    const xlsx = await exportReport(
      s.owner,
      s.venueId,
      "staff",
      {
        ...range,
        format: "xlsx",
      },
      labels,
    );

    expect(period).toContainEqual(["Nap", FRIDAY, "4", "8", "11700", "500"]);
    expect(period).toContainEqual(["Hőtérkép", "P 02:00", "1", "", "", ""]);
    expect(period).toContainEqual(["Termék", "Mojito", "2", "3", "7500", ""]);
    expect(period).toContainEqual(["QR", "Nincs QR", "2", "3", "4000", "200"]);
    expect(xlsx.filename).toMatch(/\.xlsx$/);
    await expect(
      exportReport(s.manager, s.venueId, "period", range, labels),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("durationText", () => {
  it("writes minutes and seconds, and a dash for none", () => {
    expect([durationText(400), durationText(59.6), durationText(null)]).toEqual(
      ["6:40", "1:00", "–"],
    );
  });
});
