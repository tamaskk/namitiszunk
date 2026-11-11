import {
  AuditLog,
  Bar,
  connectDb,
  Order,
  Payment,
  RateLimit,
  Refund,
  User,
  Venue,
  VenueMember,
} from "@namitiszunk/db";
import ExcelJS from "exceljs";
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
  type ExportLabels,
  exportColumns,
  exportVenueOrders,
  getVenueOrder,
  listVenueOrders,
  maskEmail,
  maskPhone,
} from "./admin-orders";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_admin_orders_test"));
  await Promise.all(
    [
      Venue,
      Bar,
      Order,
      Payment,
      RateLimit,
      Refund,
      User,
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

// 23:00 Budapest on 2026-11-11: business day "2026-11-11".
const now = new Date("2026-11-11T22:00:00Z");

async function seed() {
  const venueId = new Types.ObjectId();
  await Venue.create({ _id: venueId, slug: `pilot-${venueId}`, name: "Pilot" });
  const bar = await Bar.create({ venueId, name: "=Főpult" });
  const [bartenderMember, managerMember] = await VenueMember.create([
    { venueId, role: "bartender", displayName: "Bence" },
    { venueId, role: "manager", displayName: "Péter" },
  ]);
  const actor = (
    member: typeof bartenderMember,
    role: "bartender" | "manager",
  ) =>
    ({
      kind: "staff",
      venueId: String(venueId),
      memberId: String(member!._id),
      role,
    }) as Actor;
  return {
    venueId: String(venueId),
    barId: String(bar._id),
    bartenderMemberId: String(bartenderMember!._id),
    managerMemberId: String(managerMember!._id),
    bartender: actor(bartenderMember, "bartender"),
    manager: actor(managerMember, "manager"),
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
    barId: s.barId,
    shortNumber: 214,
    businessDate: "2026-11-11",
    status: "picked_up",
    items: [
      {
        itemId: new Types.ObjectId(),
        name: "Cerveza",
        unitPriceHuf: 1500,
        quantity: 2,
        lineTotalHuf: 3000,
        options: [{ groupName: "Méret", name: "0,5 l" }],
      },
    ],
    subtotalHuf: 3000,
    serviceFeeHuf: 300,
    tipHuf: 200,
    totalHuf: 3500,
    pickupCode: "K7Q",
    guestTokenHash: `${seq}`.padStart(64, "a"),
    acceptedTermsVersion: "draft-2026-11",
    paidAt: now,
    acceptedAt: now,
    ...overrides,
  });
}

const labels: ExportLabels = {
  columns: Object.fromEntries(
    exportColumns.map((c) => [c, c]),
  ) as ExportLabels["columns"],
  status: new Proxy({} as ExportLabels["status"], {
    get: (_, status) => `status:${String(status)}`,
  }),
  methods: { card: "Kártya", apple_pay: "Apple Pay" },
  filename: "rendelesek",
  sheet: "Rendelések",
};

describe("listVenueOrders", () => {
  it("finds #214 on the chosen business day only, and never an unpaid order", async () => {
    const s = await seed();
    const today = await order(s);
    await order(s, { businessDate: "2026-11-10" });
    await order(s, {
      shortNumber: 215,
      status: "cancelled",
      paidAt: undefined,
    });

    const page = await listVenueOrders(
      s.manager,
      s.venueId,
      { date: "2026-11-11", number: 214 },
      now,
    );

    expect(page.total).toBe(1);
    expect(page.orders).toMatchObject([
      {
        id: String(today._id),
        shortNumber: 214,
        barName: "=Főpult",
        totalHuf: 3500,
      },
    ]);
  });

  it("defaults to today's business day and filters missing receipts and problem reports", async () => {
    const s = await seed();
    const noReceipt = await order(s, { shortNumber: 1 });
    await order(s, {
      shortNumber: 2,
      receiptEnteredBy: s.bartenderMemberId,
      receiptEnteredAt: now,
    });
    await order(s, {
      shortNumber: 3,
      status: "rejected",
      acceptedAt: undefined,
    });
    const accepted = await order(s, { shortNumber: 5, status: "refunded" });
    const reported = await order(s, {
      shortNumber: 4,
      receiptEnteredBy: s.bartenderMemberId,
      receiptEnteredAt: now,
      problemReports: [{ category: "not_received", createdAt: now }],
    });

    const missing = await listVenueOrders(
      s.manager,
      s.venueId,
      { missingReceipt: true },
      now,
    );
    const problems = await listVenueOrders(
      s.manager,
      s.venueId,
      { problem: true },
      now,
    );

    expect(missing.businessDate).toBe("2026-11-11");
    expect(missing.orders.map((o) => o.id).sort()).toEqual(
      [String(noReceipt._id), String(accepted._id)].sort(),
    );
    expect(problems.orders).toMatchObject([
      { id: String(reported._id), problemCount: 1 },
    ]);
  });

  it("filters by bar, total range and payment method", async () => {
    const s = await seed();
    const terrace = await Bar.create({ venueId: s.venueId, name: "Terasz" });
    const small = await order(s, { shortNumber: 1, totalHuf: 900 });
    const onTerrace = await order(s, { shortNumber: 2, barId: terrace._id });
    const withApple = await order(s, { shortNumber: 3 });
    await Payment.create([
      {
        venueId: s.venueId,
        orderId: small._id,
        stripePaymentIntentId: "pi_1",
        amountHuf: 900,
        cardBrand: "visa",
      },
      {
        venueId: s.venueId,
        orderId: withApple._id,
        stripePaymentIntentId: "pi_3",
        amountHuf: 3500,
        wallet: "apple_pay",
      },
    ]);
    const ids = async (filter: Parameters<typeof listVenueOrders>[2]) =>
      (await listVenueOrders(s.manager, s.venueId, filter, now)).orders.map(
        (o) => o.id,
      );

    const byBar = await ids({ barId: String(terrace._id) });
    const byAmount = await ids({ maxHuf: 1000 });
    const byApple = await ids({ method: "apple_pay" });
    const byCard = await ids({ method: "card" });

    expect(byBar).toEqual([String(onTerrace._id)]);
    expect(byAmount).toEqual([String(small._id)]);
    expect(byApple).toEqual([String(withApple._id)]);
    expect(byCard).toEqual([String(small._id)]);
  });

  it("refuses a bartender", async () => {
    const s = await seed();

    const attempt = () => listVenueOrders(s.bartender, s.venueId, {}, now);

    await expect(attempt()).rejects.toMatchObject({ status: 403 });
  });
});

describe("getVenueOrder", () => {
  it("shows masked contact, who did what, and the refunds", async () => {
    const s = await seed();
    const user = await User.create({ email: "kata@gmail.com", name: "Kata" });
    const o = await order(s, {
      userId: user._id,
      guestPhone: "+36301234512",
      receiptEnteredBy: s.bartenderMemberId,
      receiptEnteredAt: now,
    });
    const payment = await Payment.create({
      venueId: s.venueId,
      orderId: o._id,
      stripePaymentIntentId: "pi_123",
      amountHuf: 3500,
      applicationFeeHuf: 35,
      status: "partially_refunded",
      cardBrand: "visa",
      cardLast4: "4242",
    });
    const refund = await Refund.create({
      venueId: s.venueId,
      paymentId: payment._id,
      orderId: o._id,
      amountHuf: 1500,
      reason: "Rossz ital",
      initiatedBy: { type: "venue_member", id: s.managerMemberId },
      status: "succeeded",
    });
    await AuditLog.create([
      {
        actor: { type: "venue_member", id: s.bartenderMemberId },
        venueId: s.venueId,
        action: "order.pick_up",
        target: { type: "order", id: o._id },
      },
      {
        actor: { type: "venue_member", id: s.managerMemberId },
        venueId: s.venueId,
        action: "refund.created",
        target: { type: "refund", id: refund._id },
      },
      {
        // HQ support acting as a User with no membership here: shown by kind, never by name.
        actor: { type: "user", id: new Types.ObjectId() },
        venueId: s.venueId,
        action: "refund.succeeded",
        target: { type: "refund", id: refund._id },
      },
    ]);

    const detail = await getVenueOrder(s.manager, String(o._id));

    expect(detail.guest).toEqual({
      email: "k***@gmail.com",
      phone: "+36 30 *** **12",
    });
    expect(detail.payment).toEqual({
      paymentIntentId: "pi_123",
      wallet: null,
      card: "visa •4242",
    });
    expect(detail.receipt).toMatchObject({ by: "Bence" });
    expect(detail.amounts).toMatchObject({
      refundedHuf: 1500,
      platformFeeHuf: 35,
    });
    expect(detail.refunds).toMatchObject([
      {
        amountHuf: 1500,
        reason: "Rossz ital",
        by: { kind: "staff", name: "Péter" },
      },
    ]);
    expect(detail.timeline).toMatchObject([
      { action: "order.pick_up", by: { name: "Bence" } },
      { action: "refund.created", by: { name: "Péter" } },
      { action: "refund.succeeded", by: { kind: "platform", name: null } },
    ]);
    // The Payment's amount is the base, as in refundOrder.
    expect(detail.can).toEqual({
      refund: true,
      refundableHuf: 2000,
      cancel: false,
    });
  });

  it("offers cancel on a New order, and hides another venue's order", async () => {
    const s = await seed();
    const fresh = await order(s, { status: "new" });
    const other = await seed();

    const detail = await getVenueOrder(s.manager, String(fresh._id));
    const attempt = () => getVenueOrder(other.manager, String(fresh._id));

    expect(detail.can).toMatchObject({ refund: false, cancel: true });
    await expect(attempt()).rejects.toMatchObject({ status: 404 });
  });
});

describe("exportVenueOrders", () => {
  it("writes a CSV for the books without guest data, formulas neutralised", async () => {
    const s = await seed();
    await order(s, { guestPhone: "+36301234512" });
    await order(s, { businessDate: "2026-12-01" });

    const file = await exportVenueOrders(
      s.manager,
      s.venueId,
      { from: "2026-11-01", to: "2026-11-30", format: "csv" },
      labels,
    );
    const text = new TextDecoder().decode(file.body);

    expect(file.filename).toBe("rendelesek-2026-11-01_2026-11-30.csv");
    expect(text.trim().split("\n")).toHaveLength(2);
    expect(text).toContain("'=Főpult");
    expect(text).toContain("status:picked_up");
    expect(text).not.toContain("4512");
  });

  it("writes an Excel file with whole forint amounts", async () => {
    const s = await seed();
    await order(s);

    const file = await exportVenueOrders(
      s.manager,
      s.venueId,
      { from: "2026-11-11", to: "2026-11-11", format: "xlsx" },
      labels,
    );
    const book = new ExcelJS.Workbook();
    // exceljs types want a Node Buffer; the bytes are the same.
    await book.xlsx.load(Buffer.from(file.body) as unknown as ArrayBuffer);
    const sheet = book.worksheets[0]!;
    const row = sheet.getRow(2);

    expect(sheet.name).toBe("Rendelések");
    expect(row.getCell(exportColumns.indexOf("bar") + 1).value).toBe("=Főpult");
    expect(row.getCell(exportColumns.indexOf("totalHuf") + 1).value).toBe(3500);
    expect(row.getCell(exportColumns.indexOf("shortNumber") + 1).value).toBe(
      214,
    );
  });

  it("allows ten exports a minute per person", async () => {
    const s = await seed();
    const run = () =>
      exportVenueOrders(
        s.manager,
        s.venueId,
        { from: "2026-11-11", to: "2026-11-11", format: "csv" },
        labels,
      );

    for (let i = 0; i < 10; i++) await run();

    await expect(run()).rejects.toMatchObject({ status: 429 });
  });

  it("refuses a bartender", async () => {
    const s = await seed();

    const attempt = () =>
      exportVenueOrders(
        s.bartender,
        s.venueId,
        { from: "2026-11-11", to: "2026-11-11", format: "csv" },
        labels,
      );

    await expect(attempt()).rejects.toMatchObject({ status: 403 });
  });
});

describe("masking", () => {
  it("keeps the first letter and the domain of an e-mail, and the ends of a phone number", () => {
    expect(maskEmail("kata@gmail.com")).toBe("k***@gmail.com");
    expect(maskPhone("+36301234512")).toBe("+36 30 *** **12");
    // Fails closed: a value that does not parse keeps only its last two digits.
    expect(maskPhone("06301234567")).toBe("*** **67");
    expect(maskPhone("garbage")).toBe("*** **");
  });
});
