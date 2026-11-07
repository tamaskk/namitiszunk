import { AuditLog, connectDb, StripeEvent, Venue } from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { type Actor, Forbidden } from "../auth/permissions";
import { ConflictError } from "../errors";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

// The Stripe API is the boundary: every call is a mock, signatures use the real SDK.
const api = vi.hoisted(() => ({
  accounts: {
    create: vi.fn(),
    update: vi.fn(),
    createLoginLink: vi.fn(),
  },
  accountLinks: { create: vi.fn() },
  paymentMethodDomains: { list: vi.fn(), create: vi.fn() },
}));
vi.mock("./stripe-client", () => ({ stripe: () => api }));

const {
  assertVenueCanCharge,
  createAccountLink,
  createConnectAccount,
  createDashboardLoginLink,
  ORDER_DOMAIN,
  processConnectWebhook,
  setPayoutSchedule,
} = await import("./connect");

const secret = "whsec_test_secret";
const venueId = new Types.ObjectId();
const accountId = "acct_1TestVenue";

const owner: Actor = {
  kind: "user",
  userId: new Types.ObjectId().toHexString(),
  memberships: [
    {
      venueId: venueId.toHexString(),
      memberId: new Types.ObjectId().toHexString(),
      role: "owner",
    },
  ],
};
const manager: Actor = {
  kind: "user",
  userId: new Types.ObjectId().toHexString(),
  memberships: [
    {
      venueId: venueId.toHexString(),
      memberId: new Types.ObjectId().toHexString(),
      role: "manager",
    },
  ],
};

/** A fixed account.updated event, as the Connect endpoint receives it. */
function accountUpdated(
  id: string,
  account: {
    charges_enabled: boolean;
    payouts_enabled: boolean;
    currently_due: string[];
  },
) {
  return {
    id,
    object: "event",
    type: "account.updated",
    account: accountId,
    api_version: "2026-10-28.endive",
    created: 1_794_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: accountId,
        object: "account",
        type: "express",
        country: "HU",
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements: { currently_due: account.currently_due },
      },
    },
  };
}

function signed(event: object, signingSecret = secret) {
  const body = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: signingSecret,
  });
  return [body, signature] as const;
}

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_connect_test"));
  await Promise.all([
    Venue.syncIndexes(),
    StripeEvent.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);
  process.env.STRIPE_WEBHOOK_SECRET = secret;
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  api.paymentMethodDomains.list.mockResolvedValue({ data: [] });
  api.paymentMethodDomains.create.mockResolvedValue({ id: "pmd_1" });
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

async function createVenue(overrides: Record<string, unknown> = {}) {
  await Venue.create({
    _id: venueId,
    slug: "pilot",
    name: "Pilot Club",
    ...overrides,
  });
}

describe("createConnectAccount", () => {
  it("creates an Express HU account with card payments and transfers and stores its id", async () => {
    await createVenue();
    api.accounts.create.mockResolvedValue({ id: accountId });

    const result = await createConnectAccount(venueId.toHexString(), owner);

    expect(result).toEqual({ stripeAccountId: accountId });
    expect(api.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "HU",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      }),
      { idempotencyKey: `connect-account-${venueId.toHexString()}` },
    );
    const venue = await Venue.findById(venueId).lean();
    expect(venue?.stripeAccountId).toBe(accountId);
    expect(
      await AuditLog.countDocuments({ action: "venue.stripe_account_created" }),
    ).toBe(1);
  });

  it("returns the existing account without calling Stripe again", async () => {
    await createVenue({ stripeAccountId: accountId });

    const result = await createConnectAccount(venueId.toHexString(), owner);

    expect(result).toEqual({ stripeAccountId: accountId });
    expect(api.accounts.create).not.toHaveBeenCalled();
  });

  it("refuses a manager: only the Owner manages payouts", async () => {
    await createVenue();

    await expect(
      createConnectAccount(venueId.toHexString(), manager),
    ).rejects.toBeInstanceOf(Forbidden);

    expect(api.accounts.create).not.toHaveBeenCalled();
  });
});

describe("owner-only account actions", () => {
  it("builds the onboarding link back to the Admin Payouts page", async () => {
    await createVenue({ stripeAccountId: accountId });
    api.accountLinks.create.mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_1TestVenue/abc",
      expires_at: 1_794_000_300,
    });

    const link = await createAccountLink(
      venueId.toHexString(),
      owner,
      "https://admin.namitiszunk.hu",
    );

    expect(link.url).toContain("connect.stripe.com");
    expect(api.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: accountId,
        type: "account_onboarding",
        return_url: "https://admin.namitiszunk.hu/payouts?stripe=return",
        refresh_url: "https://admin.namitiszunk.hu/payouts?stripe=refresh",
      }),
    );
  });

  it("asks for an account before an onboarding link", async () => {
    await createVenue();

    await expect(
      createAccountLink(venueId.toHexString(), owner, "http://localhost:3002"),
    ).rejects.toMatchObject({ code: "stripe_account_missing" });
  });

  it("sets a weekly payout schedule on the account and audits it", async () => {
    await createVenue({ stripeAccountId: accountId });
    api.accounts.update.mockResolvedValue({ id: accountId });

    await setPayoutSchedule(venueId.toHexString(), owner, "weekly");

    expect(api.accounts.update).toHaveBeenCalledWith(accountId, {
      settings: {
        payouts: { schedule: { interval: "weekly", weekly_anchor: "monday" } },
      },
    });
    expect(
      await AuditLog.countDocuments({ action: "venue.payout_schedule_set" }),
    ).toBe(1);
  });

  it("refuses a manager the schedule and the dashboard link", async () => {
    await createVenue({ stripeAccountId: accountId });

    await expect(
      setPayoutSchedule(venueId.toHexString(), manager, "daily"),
    ).rejects.toBeInstanceOf(Forbidden);
    await expect(
      createDashboardLoginLink(venueId.toHexString(), manager),
    ).rejects.toBeInstanceOf(Forbidden);

    expect(api.accounts.update).not.toHaveBeenCalled();
    expect(api.accounts.createLoginLink).not.toHaveBeenCalled();
  });

  it("gives the Owner an Express Dashboard login link", async () => {
    await createVenue({ stripeAccountId: accountId });
    api.accounts.createLoginLink.mockResolvedValue({
      url: "https://connect.stripe.com/express/abc",
    });

    const link = await createDashboardLoginLink(venueId.toHexString(), owner);

    expect(link).toEqual({ url: "https://connect.stripe.com/express/abc" });
  });
});

describe("processConnectWebhook", () => {
  const enabled = {
    charges_enabled: true,
    payouts_enabled: true,
    currently_due: [],
  };

  it("rejects a bad signature with 400 and writes nothing", async () => {
    await createVenue({ stripeAccountId: accountId });
    const [body] = signed(accountUpdated("evt_bad", enabled));
    const [, foreignSignature] = signed(
      accountUpdated("evt_bad", enabled),
      "whsec_someone_else",
    );

    await expect(
      processConnectWebhook(body, foreignSignature),
    ).rejects.toMatchObject({ status: 400, code: "invalid_signature" });
    await expect(processConnectWebhook(body, null)).rejects.toMatchObject({
      status: 400,
    });

    expect(await StripeEvent.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
    const venue = await Venue.findById(venueId).lean();
    expect(venue?.chargesEnabled).toBe(false);
  });

  it("rejects a body changed after signing", async () => {
    const [body, signature] = signed(accountUpdated("evt_tamper", enabled));

    await expect(
      processConnectWebhook(body.replace("false", "true"), signature),
    ).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("mirrors charges, payouts and missing requirements onto the venue", async () => {
    await createVenue({ stripeAccountId: accountId });
    const [body, signature] = signed(
      accountUpdated("evt_1", {
        charges_enabled: false,
        payouts_enabled: false,
        currently_due: ["external_account", "company.tax_id"],
      }),
    );

    await processConnectWebhook(body, signature);

    const venue = await Venue.findById(venueId).lean();
    expect(venue).toMatchObject({
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeRequirementsDue: ["external_account", "company.tax_id"],
    });
    expect(
      await AuditLog.countDocuments({ action: "venue.stripe_account_updated" }),
    ).toBe(1);
    expect(api.paymentMethodDomains.create).not.toHaveBeenCalled();
  });

  it("processes a redelivered event once", async () => {
    await createVenue({ stripeAccountId: accountId });
    const [body, signature] = signed(accountUpdated("evt_dup", enabled));

    await processConnectWebhook(body, signature);
    await processConnectWebhook(body, signature);

    expect(await StripeEvent.countDocuments({ eventId: "evt_dup" })).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(1);
    expect(api.paymentMethodDomains.create).toHaveBeenCalledTimes(1);
  });

  it("registers the order domain once, when charges become enabled", async () => {
    await createVenue({ stripeAccountId: accountId });
    const first = signed(accountUpdated("evt_a", enabled));
    const second = signed(accountUpdated("evt_b", enabled));

    await processConnectWebhook(...first);
    await processConnectWebhook(...second);

    const venue = await Venue.findById(venueId).lean();
    expect(venue).toMatchObject({ chargesEnabled: true, payoutsEnabled: true });
    expect(api.paymentMethodDomains.create).toHaveBeenCalledTimes(1);
    expect(api.paymentMethodDomains.create).toHaveBeenCalledWith(
      { domain_name: ORDER_DOMAIN, enabled: true },
      { stripeAccount: accountId },
    );
  });

  it("skips creating a domain the account already has", async () => {
    await createVenue({ stripeAccountId: accountId });
    api.paymentMethodDomains.list.mockResolvedValue({
      data: [{ id: "pmd_existing", domain_name: ORDER_DOMAIN }],
    });

    await processConnectWebhook(...signed(accountUpdated("evt_c", enabled)));

    expect(api.paymentMethodDomains.create).not.toHaveBeenCalled();
    const venue = await Venue.findById(venueId).lean();
    expect(venue?.chargesEnabled).toBe(true);
  });

  it("rolls back when the domain registration fails, so Stripe's retry runs it again", async () => {
    await createVenue({ stripeAccountId: accountId });
    api.paymentMethodDomains.create.mockRejectedValueOnce(new Error("down"));
    const delivery = signed(accountUpdated("evt_retry", enabled));

    await expect(processConnectWebhook(...delivery)).rejects.toThrow("down");
    expect(await StripeEvent.countDocuments()).toBe(0);
    await processConnectWebhook(...delivery);

    const venue = await Venue.findById(venueId).lean();
    expect(venue?.chargesEnabled).toBe(true);
    expect(api.paymentMethodDomains.create).toHaveBeenCalledTimes(2);
  });

  it("acknowledges an event type it does not handle without storing it", async () => {
    const [body, signature] = signed({
      ...accountUpdated("evt_other", enabled),
      type: "payout.paid",
    });

    await processConnectWebhook(body, signature);

    expect(await StripeEvent.countDocuments()).toBe(0);
  });
});

describe("assertVenueCanCharge", () => {
  it("allows a venue whose account can charge", () => {
    expect(() =>
      assertVenueCanCharge({
        stripeAccountId: accountId,
        chargesEnabled: true,
      }),
    ).not.toThrow();
  });

  it.each([
    { stripeAccountId: undefined, chargesEnabled: false },
    { stripeAccountId: accountId, chargesEnabled: false },
    { stripeAccountId: undefined, chargesEnabled: true },
  ])("refuses %o with 409 payments_not_enabled", (venue) => {
    expect(() => assertVenueCanCharge(venue)).toThrow(ConflictError);
    expect(() => assertVenueCanCharge(venue)).toThrow("payments_not_enabled");
  });
});
