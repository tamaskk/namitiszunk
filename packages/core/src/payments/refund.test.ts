import {
  AuditLog,
  Bar,
  connectDb,
  type OrderStatus,
  Order,
  Payment,
  Refund,
  StripeEvent,
  Venue,
} from "@namitiszunk/db";
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
import { setDefaultErrorReporter } from "../report-error";

vi.mock("server-only", () => ({}));
vi.mock("../realtime", () => ({ publishStatusChange: vi.fn() }));

// The Stripe API is the boundary: every call is a mock, webhook signatures use the real SDK.
const api = vi.hoisted(() => ({
  refunds: { create: vi.fn(), list: vi.fn(), retrieve: vi.fn() },
}));
vi.mock("./stripe-client", () => ({ stripe: () => api }));

const { refundOrder, refundOrderInFull, assertMayRefund } =
  await import("./refund");
const { processConnectWebhook } = await import("./connect");
const { transition } = await import("../orders/transition");

const secret = "whsec_test_secret";
const accountId = "acct_1TestVenue";
const venueId = new Types.ObjectId();
const barId = new Types.ObjectId();
const vid = venueId.toHexString();

const member = (role: "owner" | "manager" | "bartender"): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toHexString(),
  memberships: [
    { venueId: vid, memberId: new Types.ObjectId().toHexString(), role },
  ],
});
const owner = member("owner");
const manager = member("manager");
const bartenderPin: Actor = {
  kind: "staff",
  venueId: vid,
  memberId: new Types.ObjectId().toHexString(),
  role: "bartender",
};
const support = (confirmedWrite: boolean): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toHexString(),
  memberships: [],
  platformRole: "support",
  confirmedWrite,
});

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;
const reported = vi.fn();

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_refund_test"));
  await Promise.all([
    Refund.syncIndexes(),
    Payment.syncIndexes(),
    StripeEvent.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  setDefaultErrorReporter(reported);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

let seq = 0;
beforeEach(async () => {
  vi.clearAllMocks();
  seq = 0;
  api.refunds.create.mockImplementation(
    async (params: { metadata: { refundId: string } }) => ({
      id: `re_${params.metadata.refundId}`,
      status: "pending",
    }),
  );
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  await Venue.create({
    _id: venueId,
    slug: "pilot",
    name: "Pilot",
    stripeAccountId: accountId,
    orderRules: { refundOnExpiry: true },
  });
  await Bar.create({ _id: barId, venueId, name: "Main Bar" });
});

/** A paid order (fixture: status set directly) and its succeeded Payment of 2490 Ft. */
async function paidOrder(status: OrderStatus = "picked_up", amountHuf = 2490) {
  seq += 1;
  const order = await Order.create({
    venueId,
    barId,
    status,
    shortNumber: 200 + seq,
    businessDate: "2026-11-07",
    items: [
      {
        itemId: new Types.ObjectId(),
        name: "Gin tonic",
        unitPriceHuf: amountHuf,
        quantity: 1,
        lineTotalHuf: amountHuf,
      },
    ],
    subtotalHuf: amountHuf,
    totalHuf: amountHuf,
    pickupCode: "K7Q",
    guestTokenHash: String(seq).padStart(64, "a"),
    acceptedTermsVersion: "2026-11-01",
    acceptedAt: new Date(),
  });
  const payment = await Payment.create({
    venueId,
    orderId: order._id,
    stripePaymentIntentId: `pi_${seq}`,
    amountHuf,
    applicationFeeHuf: 100,
    status: "succeeded",
  });
  return { order, orderId: order.id as string, payment };
}

const statusOf = async (id: string) =>
  (await Order.findById(id).lean())?.status;

describe("refundOrder", () => {
  it("refunds in full on the connected account with the platform fee and the Refund id as key", async () => {
    const { orderId, payment } = await paidOrder();

    const result = await refundOrder(orderId, "full", "Wrong drink", owner);

    expect(result).toMatchObject({ amountHuf: 2490, status: "pending" });
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(api.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: 249_000,
        refund_application_fee: true,
        metadata: { refundId: result.refundId },
      },
      { stripeAccount: accountId, idempotencyKey: result.refundId },
    );
    const refund = await Refund.findById(result.refundId).lean();
    expect(refund).toMatchObject({
      amountHuf: 2490,
      status: "pending",
      reason: "Wrong drink",
      stripeRefundId: `re_${result.refundId}`,
      initiatedBy: { type: "venue_member" },
    });
    const log = await AuditLog.findOne({ action: "refund.created" }).lean();
    expect(log?.after).toMatchObject({ amountHuf: 2490 });
    // Stripe only accepted it: the order becomes Refunded when the webhook confirms the refund.
    expect(await statusOf(orderId)).toBe("picked_up");
  });

  it("refunds in parts up to the remaining amount, then answers 409", async () => {
    const { orderId } = await paidOrder();

    await refundOrder(orderId, 1000, "Missing ice", owner);
    await refundOrder(orderId, 490, "Missing lime", manager);
    expect(await statusOf(orderId)).toBe("picked_up");

    await expect(refundOrder(orderId, 1001, "Too much", owner)).rejects.toThrow(
      expect.objectContaining({
        status: 409,
        code: "refund_exceeds_remaining",
      }),
    );
    expect(api.refunds.create.mock.calls.map((c) => c[0].amount)).toEqual([
      100_000, 49_000,
    ]);
    await refundOrder(orderId, "full", "Rest", owner);
    expect(api.refunds.create.mock.calls.at(-1)?.[0].amount).toBe(100_000);
    expect(await statusOf(orderId)).toBe("picked_up");
  });

  it("counts failed refunds as not refunded", async () => {
    const { orderId, payment } = await paidOrder();
    await Refund.create({
      venueId,
      paymentId: payment._id,
      orderId,
      amountHuf: 2490,
      reason: "x",
      initiatedBy: { type: "system" },
      status: "failed",
    });

    await expect(
      refundOrder(orderId, 2490, "Retry", owner),
    ).resolves.toMatchObject({ amountHuf: 2490 });
  });

  it("starts the same full refund once: the second call finds nothing left (409)", async () => {
    const { orderId } = await paidOrder();

    const results = await Promise.allSettled([
      refundOrder(orderId, "full", "Double click", owner),
      refundOrder(orderId, "full", "Double click", owner),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConflictError);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(await Refund.countDocuments()).toBe(1);
  });

  it("rejects a bartender on a PIN after hand-over with 403", async () => {
    const { orderId } = await paidOrder("picked_up");

    await expect(
      refundOrder(orderId, "full", "Guest asked", bartenderPin),
    ).rejects.toBeInstanceOf(Forbidden);
    await expect(
      assertMayRefund(orderId, bartenderPin, "full"),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect(await Refund.countDocuments()).toBe(0);
  });

  it("lets a manager refund any amount while the venue has no limit configured", async () => {
    const { orderId } = await paidOrder("picked_up", 90_000);

    await expect(
      refundOrder(orderId, 89_000, "Big table", manager),
    ).resolves.toMatchObject({ amountHuf: 89_000 });
    await expect(
      assertMayRefund(orderId, manager, 1000),
    ).resolves.toBeUndefined();
  });

  it("lets HQ support refund for the venue only after the write confirmation, logged as the actor", async () => {
    const { orderId } = await paidOrder();

    await expect(
      refundOrder(orderId, 500, "Support ticket", support(false)),
    ).rejects.toBeInstanceOf(Forbidden);

    const confirmed = support(true);
    const result = await refundOrder(orderId, 500, "Support ticket", confirmed);
    const refund = await Refund.findById(result.refundId).lean();
    expect(refund?.initiatedBy?.type).toBe("platform_member");
    const log = await AuditLog.findOne({ action: "refund.created" }).lean();
    // Acting directly with a platform role is not impersonation: the support user is the actor.
    expect(log?.impersonatedBy).toBeUndefined();
    expect(String(log?.actor?.id)).toBe(
      (confirmed as { userId: string }).userId,
    );
  });

  it("answers 409 for an unpaid order and 400 for a bad amount or missing reason", async () => {
    const { orderId, payment } = await paidOrder();
    await expect(refundOrder(orderId, 0, "x", owner)).rejects.toMatchObject({
      status: 400,
    });
    await expect(refundOrder(orderId, 10.5, "x", owner)).rejects.toMatchObject({
      status: 400,
    });
    await expect(refundOrder(orderId, 100, " ", owner)).rejects.toMatchObject({
      code: "reason_required",
    });
    await Payment.deleteOne({ _id: payment._id });
    await expect(refundOrder(orderId, 100, "x", owner)).rejects.toMatchObject({
      status: 409,
      code: "order_not_paid",
    });
  });

  it("marks the Refund failed and reports it when Stripe refuses", async () => {
    const { orderId } = await paidOrder();
    const stripeError = new Stripe.errors.StripeInvalidRequestError({
      message: "insufficient balance",
      type: "invalid_request_error",
      statusCode: 400,
    });
    api.refunds.create.mockRejectedValueOnce(stripeError);

    await expect(refundOrder(orderId, 500, "x", owner)).rejects.toMatchObject({
      status: 409,
      code: "refund_failed",
    });
    const refund = await Refund.findOne().lean();
    expect(refund?.status).toBe("failed");
    expect(reported).toHaveBeenCalledWith(stripeError);
    expect(await AuditLog.countDocuments({ action: "refund.failed" })).toBe(1);
    expect(await statusOf(orderId)).toBe("picked_up");
  });
});

describe("refundOrder: unknown outcome, retries, status and limits", () => {
  it("keeps the Refund pending when the Stripe call times out, and a retry resends it with the same key", async () => {
    const { orderId } = await paidOrder();
    const timeout = new Stripe.errors.StripeConnectionError({
      message: "timed out",
    });
    api.refunds.create.mockRejectedValueOnce(timeout);

    const first = await refundOrder(orderId, 1000, "Ice", owner, {
      requestKey: "k".repeat(64),
    });
    const retry = await refundOrder(orderId, 1000, "Ice", owner, {
      requestKey: "k".repeat(64),
    });

    expect(first).toMatchObject({ amountHuf: 1000, status: "pending" });
    expect(retry.refundId).toBe(first.refundId);
    const refund = await Refund.findById(first.refundId).lean();
    expect(refund?.status).toBe("pending");
    expect(refund?.stripeRefundId).toBe(`re_${first.refundId}`);
    expect(reported).toHaveBeenCalledWith(timeout);
    expect(
      api.refunds.create.mock.calls.map((c) => c[1].idempotencyKey),
    ).toEqual([first.refundId, first.refundId]);
    // Pending counts as refunded, so the rest is 1490.
    await expect(refundOrder(orderId, 1491, "x", owner)).rejects.toMatchObject({
      code: "refund_exceeds_remaining",
    });
  });

  it("keeps the Refund pending on a Stripe 5xx", async () => {
    const { orderId } = await paidOrder();
    api.refunds.create.mockRejectedValueOnce(
      new Stripe.errors.StripeAPIError({
        message: "server error",
        type: "api_error",
        statusCode: 500,
      }),
    );

    const result = await refundOrder(orderId, 500, "x", owner);

    expect(result.status).toBe("pending");
    expect((await Refund.findById(result.refundId).lean())?.status).toBe(
      "pending",
    );
  });

  it("returns the existing Refund for a repeated request key after a failure after the commit", async () => {
    const { orderId } = await paidOrder();
    // Stripe's own idempotency: the same key gives the same refund.
    const stripeRefunds = new Map<string, { id: string; status: string }>();
    api.refunds.create.mockImplementation(
      async (_p: unknown, opts: { idempotencyKey: string }) => {
        const refund = stripeRefunds.get(opts.idempotencyKey) ?? {
          id: `re_${stripeRefunds.size + 1}`,
          status: "pending",
        };
        stripeRefunds.set(opts.idempotencyKey, refund);
        return refund;
      },
    );
    const crash = vi
      .spyOn(Refund, "updateOne")
      .mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      refundOrder(orderId, "full", "Wrong drink", owner, {
        requestKey: "r".repeat(64),
      }),
    ).rejects.toThrow("connection reset");
    crash.mockRestore();
    const retry = await refundOrder(orderId, "full", "Wrong drink", owner, {
      requestKey: "r".repeat(64),
    });

    expect(await Refund.countDocuments()).toBe(1);
    expect(stripeRefunds.size).toBe(1);
    expect(retry).toMatchObject({ amountHuf: 2490, status: "pending" });
    expect((await Refund.findById(retry.refundId).lean())?.stripeRefundId).toBe(
      "re_1",
    );
  });

  it("refuses a request key reused for another order", async () => {
    const a = await paidOrder();
    const b = await paidOrder();
    await refundOrder(a.orderId, 100, "x", owner, {
      requestKey: "z".repeat(64),
    });

    await expect(
      refundOrder(b.orderId, 100, "x", owner, { requestKey: "z".repeat(64) }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_key_reused" });
  });

  it.each([
    "awaiting_payment",
    "new",
    "preparing",
    "ready",
    "rejected",
    "cancelled",
    "refunded",
  ] as const)(
    "refuses a staff refund while the order is %s (409)",
    async (status) => {
      const { orderId } = await paidOrder(status);

      await expect(refundOrder(orderId, 100, "x", owner)).rejects.toMatchObject(
        {
          status: 409,
          code: "refund_not_allowed_in_status",
        },
      );
      expect(api.refunds.create).not.toHaveBeenCalled();
    },
  );

  it("lets only confirmed HQ support refund a cancelled order that was paid late", async () => {
    const { orderId } = await paidOrder("cancelled");

    await expect(refundOrder(orderId, 100, "x", manager)).rejects.toMatchObject(
      { code: "refund_not_allowed_in_status" },
    );
    await expect(
      refundOrder(orderId, 100, "x", support(false)),
    ).rejects.toBeInstanceOf(Forbidden);

    await expect(
      refundOrder(orderId, 100, "Late payment", support(true)),
    ).resolves.toMatchObject({ amountHuf: 100 });
  });

  it("checks a manager's limit against the manager refunds of the order together", async () => {
    const { orderId } = await paidOrder();
    const limit = { managerRefundLimitHuf: 1000 };

    await refundOrder(orderId, 600, "Ice", manager, limit);
    await refundOrder(orderId, 500, "Owner call", owner, limit);

    await expect(
      refundOrder(orderId, 500, "Lime", member("manager"), limit),
    ).rejects.toBeInstanceOf(Forbidden);
    await expect(
      refundOrder(orderId, 400, "Lime", manager, limit),
    ).resolves.toMatchObject({ amountHuf: 400 });
  });
});

describe("refundOrderInFull", () => {
  it("refunds a rejected order in full with the platform fee, once across retries", async () => {
    const { orderId } = await paidOrder("new");
    await transition(orderId, "reject", owner, { reason: "Out of gin" });

    await refundOrderInFull(orderId, "rejected");
    await refundOrderInFull(orderId, "rejected");

    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(api.refunds.create.mock.calls[0]?.[0]).toMatchObject({
      amount: 249_000,
      refund_application_fee: true,
    });
    expect(await Refund.findOne().lean()).toMatchObject({
      reason: "rejected",
      initiatedBy: { type: "system" },
    });
    expect(await statusOf(orderId)).toBe("rejected");
  });

  it("refunds a late payment of a cancelled order once", async () => {
    const { orderId } = await paidOrder("cancelled");

    await refundOrderInFull(orderId, "late_payment");
    await refundOrderInFull(orderId, "late_payment");

    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(await Refund.findOne().lean()).toMatchObject({
      amountHuf: 2490,
      reason: "late_payment",
    });
    expect(await statusOf(orderId)).toBe("cancelled");
  });

  it("does not refund twice after the webhook moved the expired order to Refunded", async () => {
    const { orderId, payment } = await paidOrder("refunded");
    await Payment.updateOne({}, { $set: { status: "refunded" } });
    await Refund.create({
      venueId,
      paymentId: payment._id,
      orderId,
      amountHuf: 2490,
      reason: "expired",
      initiatedBy: { type: "system", kind: "system", source: "inngest" },
      stripeRefundId: "re_done",
      status: "succeeded",
    });

    await expect(
      refundOrderInFull(orderId, "expired"),
    ).resolves.toBeUndefined();
    expect(api.refunds.create).not.toHaveBeenCalled();
  });

  it("resends a Refund committed before a crash with the same idempotency key", async () => {
    const { orderId, payment } = await paidOrder("expired");
    const unsent = await Refund.create({
      venueId,
      paymentId: payment._id,
      orderId,
      amountHuf: 2490,
      reason: "expired",
      initiatedBy: { type: "system" },
    });

    await refundOrderInFull(orderId, "expired");

    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(api.refunds.create.mock.calls[0]?.[1]).toEqual({
      stripeAccount: accountId,
      idempotencyKey: unsent.id,
    });
    expect(await Refund.countDocuments()).toBe(1);
  });
});

describe("refund webhooks", () => {
  function signed(event: object) {
    const body = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    });
    return [body, signature] as const;
  }

  const refundEvent = (
    id: string,
    type: "refund.updated" | "refund.failed" | "charge.refund.updated",
    refund: {
      id: string;
      status: string;
      refundId: string;
      amount?: number;
      paymentIntent?: string;
    },
    account = accountId,
  ) => {
    const object = {
      id: refund.id,
      object: "refund",
      status: refund.status,
      amount: refund.amount ?? 100_000,
      payment_intent: refund.paymentIntent ?? "pi_1",
      metadata: { refundId: refund.refundId },
    };
    // Stripe's current state of the refund; a test may override it to model an out-of-order event.
    api.refunds.retrieve.mockResolvedValue(object);
    return {
      id,
      object: "event",
      type,
      account,
      api_version: "2026-10-28.endive",
      created: 1_794_000_000,
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: { object },
    };
  };

  it("marks the Refund succeeded, the Payment refunded and tries the order transition (charge.refunded)", async () => {
    const { orderId } = await paidOrder("expired");
    const { refundId } = await refundOrderInFull(orderId, "expired").then(
      async () => ({ refundId: String((await Refund.findOne().lean())?._id) }),
    );
    api.refunds.list.mockResolvedValue({
      data: [
        {
          id: `re_${refundId}`,
          status: "succeeded",
          amount: 249_000,
          payment_intent: "pi_1",
          metadata: { refundId },
        },
      ],
    });
    const event = {
      ...refundEvent("evt_ch", "refund.updated", {
        id: "x",
        status: "succeeded",
        refundId,
      }),
      type: "charge.refunded",
      data: { object: { id: "ch_1", object: "charge" } },
    };

    await processConnectWebhook(...signed(event));

    expect(api.refunds.list).toHaveBeenCalledWith(
      { charge: "ch_1", limit: 100 },
      { stripeAccount: accountId },
    );
    expect((await Refund.findById(refundId).lean())?.status).toBe("succeeded");
    expect((await Payment.findOne().lean())?.status).toBe("refunded");
    // The venue refunds expired orders, so the Stripe system actor may move Expired to Refunded.
    expect(await statusOf(orderId)).toBe("refunded");
    expect(await AuditLog.countDocuments({ action: "refund.succeeded" })).toBe(
      1,
    );
  });

  it("marks a partial refund's Payment partially refunded (refund.updated)", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);

    await processConnectWebhook(
      ...signed(
        refundEvent("evt_part", "refund.updated", {
          id: `re_${refundId}`,
          status: "succeeded",
          refundId,
        }),
      ),
    );

    expect((await Payment.findOne().lean())?.status).toBe("partially_refunded");
    expect(await statusOf(orderId)).toBe("picked_up");
  });

  it("marks a failed refund failed and reports it (refund.failed)", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);

    await processConnectWebhook(
      ...signed(
        refundEvent("evt_fail", "refund.failed", {
          id: `re_${refundId}`,
          status: "failed",
          refundId,
        }),
      ),
    );

    expect((await Refund.findById(refundId).lean())?.status).toBe("failed");
    expect((await Payment.findOne().lean())?.status).toBe("succeeded");
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(refundId) }),
    );
  });

  it("processes a redelivered event once", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);
    const event = refundEvent("evt_dup", "charge.refund.updated", {
      id: `re_${refundId}`,
      status: "succeeded",
      refundId,
    });

    await processConnectWebhook(...signed(event));
    await Refund.updateOne({ _id: refundId }, { $set: { status: "pending" } });
    await processConnectWebhook(...signed(event));

    expect((await Refund.findById(refundId).lean())?.status).toBe("pending");
    expect(await AuditLog.countDocuments({ action: "refund.succeeded" })).toBe(
      1,
    );
    expect(await StripeEvent.countDocuments({ eventId: "evt_dup" })).toBe(1);
  });

  it("moves a fully refunded order to Refunded only when Stripe confirms, as the staff member who refunded", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(
      orderId,
      "full",
      "Wrong drink",
      owner,
    );
    expect(await statusOf(orderId)).toBe("picked_up");

    await processConnectWebhook(
      ...signed(
        refundEvent("evt_full", "refund.updated", {
          id: `re_${refundId}`,
          status: "succeeded",
          refundId,
          amount: 249_000,
        }),
      ),
    );

    expect(api.refunds.retrieve).toHaveBeenCalledWith(
      `re_${refundId}`,
      {},
      { stripeAccount: accountId },
    );
    expect(await statusOf(orderId)).toBe("refunded");
    const log = await AuditLog.findOne({ action: "order.refund" }).lean();
    expect(String(log?.actor?.id)).toBe((owner as { userId: string }).userId);
  });

  it("leaves the order Picked up and reports it when the full refund fails", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(
      orderId,
      "full",
      "Wrong drink",
      owner,
    );

    await processConnectWebhook(
      ...signed(
        refundEvent("evt_full_fail", "refund.failed", {
          id: `re_${refundId}`,
          status: "failed",
          refundId,
          amount: 249_000,
        }),
      ),
    );

    expect(await statusOf(orderId)).toBe("picked_up");
    expect((await Refund.findById(refundId).lean())?.status).toBe("failed");
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(refundId) }),
    );
  });

  it("finishes the Refunded transition on a redelivery after it failed", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(
      orderId,
      "full",
      "Wrong drink",
      owner,
    );
    const event = signed(
      refundEvent("evt_retry", "refund.updated", {
        id: `re_${refundId}`,
        status: "succeeded",
        refundId,
        amount: 249_000,
      }),
    );
    const blip = vi
      .spyOn(Order, "findOneAndUpdate")
      .mockImplementationOnce(() => {
        throw new Error("primary stepped down");
      });

    await expect(processConnectWebhook(...event)).rejects.toThrow(
      "primary stepped down",
    );
    blip.mockRestore();
    expect(await statusOf(orderId)).toBe("picked_up");
    await processConnectWebhook(...event);

    expect(await statusOf(orderId)).toBe("refunded");
    expect(await StripeEvent.countDocuments({ eventId: "evt_retry" })).toBe(1);
  });

  it("trusts Stripe's current refund over an older event that arrives late", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);
    await processConnectWebhook(
      ...signed(
        refundEvent("evt_failed_first", "refund.failed", {
          id: `re_${refundId}`,
          status: "failed",
          refundId,
        }),
      ),
    );
    const stale = refundEvent("evt_old_success", "refund.updated", {
      id: `re_${refundId}`,
      status: "succeeded",
      refundId,
    });
    api.refunds.retrieve.mockResolvedValue({
      ...stale.data.object,
      status: "failed",
    });

    await processConnectWebhook(...signed(stale));

    expect((await Refund.findById(refundId).lean())?.status).toBe("failed");
    expect((await Payment.findOne().lean())?.status).toBe("succeeded");
  });

  it("reports a Stripe refund made outside the app", async () => {
    await paidOrder();

    await processConnectWebhook(
      ...signed(
        refundEvent("evt_dashboard", "refund.updated", {
          id: "re_dashboard",
          status: "succeeded",
          refundId: "",
        }),
      ),
    );

    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("re_dashboard"),
      }),
    );
  });

  it("ignores a refund we did not create", async () => {
    await paidOrder();
    await processConnectWebhook(
      ...signed(
        refundEvent("evt_dash", "refund.updated", {
          id: "re_dashboard",
          status: "succeeded",
          refundId: "",
        }),
      ),
    );
    expect((await Payment.findOne().lean())?.status).toBe("succeeded");
  });

  it("ignores a valid refundId sent from another venue's connected account", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);

    await processConnectWebhook(
      ...signed(
        refundEvent(
          "evt_foreign",
          "refund.updated",
          { id: "re_foreign", status: "succeeded", refundId },
          "acct_1OtherVenue",
        ),
      ),
    );

    expect((await Refund.findById(refundId).lean())?.status).toBe("pending");
    expect((await Payment.findOne().lean())?.status).toBe("succeeded");
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(refundId) }),
    );
  });

  it("ignores a refund of another PaymentIntent, another amount or another Stripe refund id", async () => {
    const { orderId } = await paidOrder();
    const { refundId } = await refundOrder(orderId, 1000, "Ice", owner);
    const ok = { status: "succeeded", refundId };

    for (const [i, refund] of [
      { ...ok, id: `re_${refundId}`, paymentIntent: "pi_other" },
      { ...ok, id: `re_${refundId}`, amount: 249_000 },
      { ...ok, id: "re_another" },
    ].entries()) {
      await processConnectWebhook(
        ...signed(refundEvent(`evt_mismatch_${i}`, "refund.updated", refund)),
      );
    }

    expect((await Refund.findById(refundId).lean())?.status).toBe("pending");
    expect(await AuditLog.countDocuments({ action: "refund.succeeded" })).toBe(
      0,
    );
    expect(reported).toHaveBeenCalledTimes(3);
  });
});
