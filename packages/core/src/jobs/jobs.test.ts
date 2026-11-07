import {
  Bar,
  connectDb,
  Order,
  Payment,
  Refund,
  User,
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

import { sendSms } from "../notify/sms";
import { onStatusChanged, transition } from "../orders/transition";
import {
  cancelUnpaidOrder,
  expireOrder,
  type NotifyDeps,
  notifyByEmail,
  notifyByPushOrSms,
  pickupDeadline,
  refundExpiredOrder,
  sendPickupReminder,
} from "./order-jobs";
import { reconcileStripe } from "./reconcile";

vi.mock("server-only", () => ({}));
vi.mock("../notify/sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../notify/sms")>()),
  sendSms: vi.fn(async () => "SM1"),
}));

const venueId = new Types.ObjectId();
const barId = new Types.ObjectId();
const readyAt = new Date("2026-11-07T22:00:00Z");

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_jobs_test"));
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.createCollection()),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  vi.mocked(sendSms).mockClear();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

let seq = 0;
async function createOrder(
  overrides: Record<string, unknown> = {},
  orderRules: Record<string, unknown> = {},
) {
  await Venue.create({
    _id: venueId,
    slug: "pilot",
    name: "Pilot",
    orderRules,
  });
  await Bar.create({ _id: barId, venueId, name: "Main Bar" });
  seq += 1;
  // Fixtures may set a status directly; app code may not (no-status-writes.test.ts).
  return Order.create({
    venueId,
    barId,
    shortNumber: 214,
    businessDate: "2026-11-07",
    items: [
      {
        itemId: new Types.ObjectId(),
        name: "Gin tonic",
        unitPriceHuf: 2490,
        quantity: 1,
        lineTotalHuf: 2490,
      },
    ],
    subtotalHuf: 2490,
    totalHuf: 2490,
    pickupCode: "K7Q",
    guestTokenHash: String(seq).padStart(64, "a"),
    acceptedTermsVersion: "2026-11-01",
    ...overrides,
  });
}

const statusOf = async (id: Types.ObjectId) =>
  (await Order.findById(id).lean())?.status;

function notifyDeps(push = false) {
  return {
    sendPush: vi.fn(async () => push),
    sendEmail: vi.fn(async () => ({ id: "e1" })),
    links: {
      order: (id: string) => `https://rendel.namitiszunk.hu/o/${id}`,
      smsStatusCallback: "https://api.namitiszunk.hu/webhooks/twilio",
    },
  } satisfies NotifyDeps;
}

describe("onStatusChanged", () => {
  it("runs registered hooks after the commit and stops after unregistering", async () => {
    const order = await createOrder({ status: "ready", readyAt });
    const hook = vi.fn();
    const off = onStatusChanged(hook);
    await transition(order.id, "expire", { kind: "system", source: "inngest" });
    off();
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "expire",
        from: "ready",
        to: "expired",
      }),
    );
    expect(await statusOf(order._id)).toBe("expired");
  });
});

describe("cancelUnpaidOrder", () => {
  it("cancels the PaymentIntent, then the order still awaiting payment", async () => {
    const order = await createOrder();
    const cancel = vi.fn(async () => {});
    expect(await cancelUnpaidOrder(order.id, cancel)).toBe("cancelled");
    expect(cancel).toHaveBeenCalledWith(order.id);
    expect(await statusOf(order._id)).toBe("cancelled");
  });

  it("leaves a paid order and its PaymentIntent alone", async () => {
    const order = await createOrder({ status: "new" });
    const cancel = vi.fn(async () => {});
    expect(await cancelUnpaidOrder(order.id, cancel)).toBe("skipped");
    expect(cancel).not.toHaveBeenCalled();
    expect(await statusOf(order._id)).toBe("new");
  });
});

describe("expiry", () => {
  it("computes the deadline from readyAt and the venue setting", async () => {
    const order = await createOrder(
      { status: "ready", readyAt },
      { pickupDeadlineMinutes: 45 },
    );
    expect(await pickupDeadline(order.id)).toEqual(
      new Date(readyAt.getTime() + 45 * 60_000),
    );
  });

  it("expires a Ready order and says whether the venue refunds", async () => {
    const order = await createOrder({ status: "ready", readyAt });
    expect(await expireOrder(order.id)).toEqual({
      expired: true,
      refund: false,
    });
    expect(await statusOf(order._id)).toBe("expired");
  });

  it("does not expire an order picked up before the deadline", async () => {
    const order = await createOrder({ status: "picked_up", readyAt });
    expect(await pickupDeadline(order.id)).toBeNull();
    expect(await expireOrder(order.id)).toEqual({
      expired: false,
      refund: false,
    });
    expect(await statusOf(order._id)).toBe("picked_up");
  });

  it("refunds an expired order when the venue enabled it", async () => {
    const order = await createOrder(
      { status: "ready", readyAt },
      { refundOnExpiry: true },
    );
    expect(await expireOrder(order.id)).toEqual({
      expired: true,
      refund: true,
    });
    const refund = vi.fn(async () => {});
    expect(await refundExpiredOrder(order.id, refund)).toBe("refunded");
    expect(refund).toHaveBeenCalledWith(order.id);
    expect(await statusOf(order._id)).toBe("refunded");
  });
});

describe("pickup reminder", () => {
  const sms = { guestPhone: "+36301234567", smsRequested: true };

  it("sends nothing when the order was picked up within 10 minutes", async () => {
    const order = await createOrder(
      { ...sms, status: "picked_up" },
      { smsEnabled: true },
    );
    const deps = notifyDeps();
    expect(await sendPickupReminder(order.id, deps)).toBe("skipped");
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("falls back to the reminder SMS without a push", async () => {
    const order = await createOrder(
      { ...sms, status: "ready", readyAt },
      { smsEnabled: true },
    );
    expect(await sendPickupReminder(order.id, notifyDeps())).toBe("sms");
    expect(sendSms).toHaveBeenCalledWith(
      "+36301234567",
      expect.stringContaining("Main Bar"),
      "https://api.namitiszunk.hu/webhooks/twilio",
    );
  });

  it("prefers a push and skips the SMS", async () => {
    const order = await createOrder(
      { ...sms, status: "ready", readyAt },
      { smsEnabled: true },
    );
    expect(await sendPickupReminder(order.id, notifyDeps(true))).toBe("push");
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("sends no SMS when the venue switched SMS off", async () => {
    const order = await createOrder({ ...sms, status: "ready", readyAt });
    expect(await sendPickupReminder(order.id, notifyDeps())).toBe("none");
    expect(sendSms).not.toHaveBeenCalled();
  });
});

describe("order/notify", () => {
  it("sends the ready SMS with the order link", async () => {
    const order = await createOrder(
      { guestPhone: "+36301234567", smsRequested: true, status: "ready" },
      { smsEnabled: true },
    );
    expect(await notifyByPushOrSms(order.id, "mark_ready", notifyDeps())).toBe(
      "sms",
    );
    expect(vi.mocked(sendSms).mock.calls[0]?.[1]).toContain(
      `https://rendel.namitiszunk.hu/o/${order.id}`,
    );
  });

  it("mails nothing to a guest without an address", async () => {
    const order = await createOrder({ status: "new" });
    const deps = notifyDeps();
    expect(await notifyByEmail(order.id, "payment_succeeded", deps)).toBe(
      "none",
    );
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("mails the confirmation, replying to the venue owner", async () => {
    const guest = await User.create({
      email: "anna@example.com",
      locale: "en",
    });
    const owner = await User.create({ email: "owner@pilot.hu" });
    const order = await createOrder({ status: "new", userId: guest._id });
    await VenueMember.create({
      venueId,
      userId: owner._id,
      role: "owner",
      displayName: "Owner",
    });
    const deps = notifyDeps();
    expect(await notifyByEmail(order.id, "payment_succeeded", deps)).toBe(
      "sent",
    );
    expect(deps.sendEmail).toHaveBeenCalledWith({
      template: "orderConfirmation",
      to: "anna@example.com",
      data: expect.objectContaining({
        locale: "en",
        venueEmail: "owner@pilot.hu",
        totalHuf: 2490,
      }),
    });
  });
});

describe("reconcileStripe", () => {
  const range = {
    from: new Date("2026-11-07T06:30:00Z"),
    to: new Date("2026-11-08T06:30:00Z"),
  };

  it("matches charges and refunds, and flags a charge whose order was deleted", async () => {
    const order = await createOrder({ status: "refunded" });
    const payment = await Payment.create({
      venueId,
      orderId: order._id,
      stripePaymentIntentId: "pi_kept",
      amountHuf: 2490,
      status: "refunded",
    });
    await Refund.create({
      venueId,
      paymentId: payment._id,
      orderId: order._id,
      amountHuf: 2490,
      reason: "expired",
      initiatedBy: { type: "system" },
      status: "succeeded",
    });

    const mismatches = await reconcileStripe(range, async () => [
      { paymentIntentId: "pi_kept", amountHuf: 2490, refundedHuf: 2490 },
      { paymentIntentId: "pi_deleted", amountHuf: 1990, refundedHuf: 0 },
    ]);

    expect(mismatches).toEqual([
      {
        paymentIntentId: "pi_deleted",
        problem: "missing_in_db",
        stripe: { amountHuf: 1990, refundedHuf: 0 },
      },
    ]);
  });

  it("flags an amount mismatch", async () => {
    const order = await createOrder({ status: "new" });
    await Payment.create({
      venueId,
      orderId: order._id,
      stripePaymentIntentId: "pi_1",
      amountHuf: 2490,
      status: "succeeded",
    });
    const mismatches = await reconcileStripe(range, async () => [
      { paymentIntentId: "pi_1", amountHuf: 2000, refundedHuf: 0 },
    ]);
    expect(mismatches.map((m) => m.problem)).toEqual(["amount"]);
  });
});
