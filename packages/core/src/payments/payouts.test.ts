import { AuditLog, connectDb, RateLimit, Venue } from "@namitiszunk/db";
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

import type { Actor, VenueRole } from "../auth/permissions";

vi.mock("server-only", () => ({}));

// The Stripe API is the boundary: every call is a mock shaped like Stripe's HUF responses (fillér).
const api = vi.hoisted(() => ({
  balance: { retrieve: vi.fn() },
  payouts: { list: vi.fn() },
  disputes: { list: vi.fn() },
  accounts: { retrieve: vi.fn(), createLoginLink: vi.fn() },
  balanceTransactions: { list: vi.fn() },
  accountLinks: { create: vi.fn() },
}));
vi.mock("./stripe-client", () => ({ stripe: () => api }));

const {
  exportBalanceTransactions,
  fetchPayoutOverview,
  getPayoutAccount,
  PAYOUT_EXPORT_MAX_ROWS,
} = await import("./payouts");
const { createAccountLink, createDashboardLoginLink } = await import(
  "./connect"
);

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;
const venueId = new Types.ObjectId();
const accountId = "acct_1PayoutVenue";

const member = (role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toHexString(),
  memberships: [{ venueId: venueId.toHexString(), memberId: "m", role }],
  twoFactorVerified: true,
});

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_payouts_test"));
  await Promise.all(
    [Venue, RateLimit, AuditLog].map((m) => m.createCollection()),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  await Venue.create({
    _id: venueId,
    name: "Klub",
    slug: `klub-${venueId.toHexString()}`,
    stripeAccountId: accountId,
    chargesEnabled: true,
    payoutsEnabled: false,
    stripeRequirementsDue: ["external_account"],
  });
});

const payout = (
  id: string,
  amount: number,
  arrival: number,
  status: string,
  currency = "huf",
) => ({
  id,
  amount,
  arrival_date: arrival,
  status,
  currency,
});
const connected = {
  connected: true as const,
  accountId,
  chargesEnabled: true,
  payoutsEnabled: false,
  requirementsDue: [],
  timeZone: "Europe/Budapest",
};

describe("getPayoutAccount", () => {
  it("tells the Owner what Stripe still needs, and refuses a Manager", async () => {
    const account = await getPayoutAccount(
      member("owner"),
      venueId.toHexString(),
    );
    const act = () =>
      getPayoutAccount(member("manager"), venueId.toHexString());

    expect(account).toEqual({
      connected: true,
      accountId,
      chargesEnabled: true,
      payoutsEnabled: false,
      requirementsDue: ["external_account"],
      timeZone: "Europe/Budapest",
    });
    await expect(act()).rejects.toMatchObject({ status: 403 });
  });

  it("says not connected for a venue without an account", async () => {
    await Venue.updateOne({ _id: venueId }, { $unset: { stripeAccountId: 1 } });

    const account = await getPayoutAccount(
      member("owner"),
      venueId.toHexString(),
    );

    expect(account).toEqual({ connected: false });
  });
});

describe("fetchPayoutOverview", () => {
  it("reads balance, the next payout and open disputes in whole forints on the account", async () => {
    api.balance.retrieve.mockResolvedValue({
      available: [{ amount: 1_234_550, currency: "huf" }],
      pending: [{ amount: 50_000, currency: "huf" }],
    });
    api.payouts.list.mockResolvedValue({
      data: [
        payout("po_paid", 900_000, 1_794_000_000, "paid"),
        payout("po_later", 300_000, 1_794_300_000, "pending"),
        payout("po_next", 200_000, 1_794_100_000, "in_transit"),
        payout("po_eur", 5_000, 1_794_050_000, "pending", "eur"),
      ],
    });
    api.disputes.list.mockResolvedValue({
      data: [
        {
          id: "dp_open",
          amount: 249_000,
          reason: "fraudulent",
          status: "needs_response",
          currency: "huf",
          evidence_details: { due_by: 1_794_500_000 },
        },
        {
          id: "dp_won",
          amount: 100,
          reason: "general",
          status: "won",
          currency: "huf",
        },
      ],
    });
    api.accounts.retrieve.mockResolvedValue({
      settings: { payouts: { schedule: { interval: "weekly" } } },
    });

    const overview = await fetchPayoutOverview(connected);

    expect(api.balance.retrieve).toHaveBeenCalledWith(
      {},
      { stripeAccount: accountId },
    );
    expect(overview).toMatchObject({
      availableHuf: 12_346, // 12 345,50 Ft rounds to the forint
      pendingHuf: 500,
      // The euro payout arrives sooner but is not counted as forints.
      nextPayout: { id: "po_next", amountHuf: 2000 },
      interval: "weekly",
      openDisputes: [{ id: "dp_open", amountHuf: 2490, reason: "fraudulent" }],
    });
    expect(overview.payouts).toHaveLength(3);
  });
});

describe("Stripe links", () => {
  it("logs an Express Dashboard and an onboarding link without the URL", async () => {
    api.accounts.createLoginLink.mockResolvedValue({
      url: "https://connect.stripe.com/express/secret",
    });
    api.accountLinks.create.mockResolvedValue({
      url: "https://connect.stripe.com/setup/secret",
      expires_at: 1_794_200_000,
    });

    await createDashboardLoginLink(venueId.toHexString(), member("owner"));
    await createAccountLink(
      venueId.toHexString(),
      member("owner"),
      "https://admin.namitiszunk.hu",
    );

    const logs = await AuditLog.find().sort({ _id: 1 }).lean();
    expect(logs.map((log) => log.action)).toEqual([
      "venue.stripe_dashboard_link_created",
      "venue.stripe_onboarding_link_created",
    ]);
    expect(JSON.stringify(logs)).not.toContain("secret");
  });

  it("refuses the eleventh Stripe action in a minute", async () => {
    api.accounts.createLoginLink.mockResolvedValue({
      url: "https://connect.stripe.com/express/x",
    });
    const owner = member("owner");
    for (let i = 0; i < 10; i++)
      await createDashboardLoginLink(venueId.toHexString(), owner);

    const eleventh = () => createDashboardLoginLink(venueId.toHexString(), owner);

    await expect(eleventh()).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    expect(api.accounts.createLoginLink).toHaveBeenCalledTimes(10);
  });
});

describe("exportBalanceTransactions", () => {
  const labels = {
    locale: "hu-HU",
    columns: {
      createdAt: "Időpont",
      type: "Típus",
      description: "Leírás",
      grossHuf: "Bruttó",
      stripeFeeHuf: "Stripe-díj",
      platformFeeHuf: "Platformdíj",
      netHuf: "Nettó",
      payoutId: "Utalás",
    },
    types: { charge: "Fizetés", payout: "Utalás" },
    filename: "egyenleg",
    sheet: "Egyenleg",
  };
  const range = { from: "2026-11-07", to: "2026-11-08" };

  function transactions(list: unknown[]) {
    api.balanceTransactions.list.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue(list),
    });
  }

  it("splits the Stripe and platform fees per transaction, over whole Budapest days", async () => {
    transactions([
      {
        id: "txn_1",
        created: 1_794_160_000,
        type: "charge",
        currency: "huf",
        description: "=SUM(A1)",
        amount: 500_000,
        net: 470_000,
        fee_details: [
          { type: "stripe_fee", amount: 25_000 },
          { type: "application_fee", amount: 5_000 },
        ],
        source: "ch_1",
      },
      {
        id: "txn_2",
        created: 1_794_170_000,
        type: "payout",
        currency: "huf",
        description: null,
        amount: -470_000,
        net: -470_000,
        fee_details: [],
        source: "po_1",
      },
    ]);

    const file = await exportBalanceTransactions(
      member("owner"),
      venueId.toHexString(),
      { ...range, format: "csv" },
      labels,
    );

    expect(api.balanceTransactions.list).toHaveBeenCalledWith(
      {
        // 2026-11-07 00:00 and 2026-11-09 00:00 Budapest (UTC+1).
        created: { gte: 1_794_006_000, lt: 1_794_178_800 },
        limit: 100,
      },
      { stripeAccount: accountId },
    );
    const text = new TextDecoder().decode(file.body);
    expect(file.filename).toBe("egyenleg-2026-11-07_2026-11-08.csv");
    expect(text).toContain("Fizetés;'=SUM(A1);5000;250;50;4700;");
    expect(text).toContain("Utalás;;-4700;0;0;-4700;po_1");
  });

  it("asks Stripe for at most 10 000 rows and refuses more than the ceiling", async () => {
    // stripe-node throws above 10 000 items; the ceiling plus one probe row must stay within it.
    const autoPagingToArray = vi.fn(({ limit }: { limit: number }) =>
      limit > 10_000
        ? Promise.reject(new Error("limit of more than 10,000 items"))
        : Promise.resolve(
            Array.from({ length: limit }, (_, i) => ({
              id: `txn_${i}`,
              created: 1_794_100_000,
              type: "charge",
              currency: "huf",
              amount: 100,
              net: 100,
              fee_details: [],
            })),
          ),
    );
    api.balanceTransactions.list.mockReturnValue({ autoPagingToArray });

    const act = () =>
      exportBalanceTransactions(
        member("owner"),
        venueId.toHexString(),
        { ...range, format: "csv" },
        labels,
      );

    await expect(act()).rejects.toMatchObject({ code: "export_too_large" });
    expect(autoPagingToArray).toHaveBeenCalledWith({
      limit: PAYOUT_EXPORT_MAX_ROWS + 1,
    });
  });

  it("refuses a period with a transaction in another currency", async () => {
    transactions([
      {
        id: "txn_eur",
        created: 1_794_160_000,
        type: "charge",
        currency: "eur",
        amount: 1_000,
        net: 900,
        fee_details: [],
      },
    ]);

    const act = () =>
      exportBalanceTransactions(
        member("owner"),
        venueId.toHexString(),
        { ...range, format: "csv" },
        labels,
      );

    await expect(act()).rejects.toMatchObject({
      code: "export_currency_unsupported",
    });
  });

  it("shows a fee under half a forint as 0, not -0", async () => {
    transactions([
      {
        id: "txn_adj",
        created: 1_794_160_000,
        type: "adjustment",
        currency: "huf",
        description: null,
        amount: -40,
        net: -40,
        fee_details: [],
      },
    ]);

    const file = await exportBalanceTransactions(
      member("owner"),
      venueId.toHexString(),
      { ...range, format: "csv" },
      labels,
    );

    const text = new TextDecoder().decode(file.body);
    expect(text).toContain("adjustment;;0;0;0;0;");
    expect(text).not.toContain("-0");
  });

  it("writes an Excel file with the same rows", async () => {
    transactions([]);

    const file = await exportBalanceTransactions(
      member("owner"),
      venueId.toHexString(),
      { ...range, format: "xlsx" },
      labels,
    );

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body.buffer);
    expect(book.getWorksheet("Egyenleg")?.getRow(1).getCell(4).value).toBe(
      "Bruttó",
    );
  });

  it("refuses a Manager and a venue that is not connected", async () => {
    const manager = () =>
      exportBalanceTransactions(
        member("manager"),
        venueId.toHexString(),
        { ...range, format: "csv" },
        labels,
      );
    await expect(manager()).rejects.toMatchObject({ status: 403 });
    await Venue.updateOne({ _id: venueId }, { $unset: { stripeAccountId: 1 } });

    const unconnected = () =>
      exportBalanceTransactions(
        member("owner"),
        venueId.toHexString(),
        { ...range, format: "csv" },
        labels,
      );

    await expect(unconnected()).rejects.toMatchObject({
      code: "stripe_account_missing",
    });
    expect(api.balanceTransactions.list).not.toHaveBeenCalled();
  });
});
