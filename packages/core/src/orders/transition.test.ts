import { AuditLog, connectDb, Counter, Order, Venue } from "@namitiszunk/db";
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

import { type Actor, Forbidden } from "../auth/permissions";
import { NotFoundError } from "../errors";
import { InvalidTransition } from "./state-machine";
import { setDefaultErrorReporter } from "../report-error";
import { onStatusChanged, transition, transitionWith } from "./transition";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));
// Ably is the boundary: record publishes instead of calling the REST API.
const publish = vi.hoisted(() => vi.fn());
vi.mock("ably", () => ({
  Rest: class {
    channels = {
      get: (channel: string) => ({
        publish: (name: string, data: unknown) => publish(channel, name, data),
      }),
    };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

const now = new Date("2026-11-07T22:00:00Z");
const venueId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const system: Actor = { kind: "system", source: "stripe" };
const bartender: Actor = {
  kind: "staff",
  venueId: venueId.toHexString(),
  memberId: memberId.toHexString(),
  role: "bartender",
};
const allow = () => {};
const guestTokenHash = "a".repeat(64);
const resource = {
  venueId: venueId.toHexString(),
  guestId: guestTokenHash,
};

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_transition_test"));
  await Promise.all([
    Order.syncIndexes(),
    AuditLog.syncIndexes(),
    Counter.syncIndexes(),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  publish.mockReset();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

async function createOrder(
  overrides: Record<string, unknown> = {},
  orderRules: Record<string, unknown> = {},
) {
  const [venue] = await Venue.create([
    { _id: venueId, slug: "pilot", name: "Pilot", orderRules },
  ]);
  // Fixtures may set a status directly; app code may not (no-status-writes.test.ts).
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: new Types.ObjectId(),
      // Provisional, as createOrder leaves it; payment numbers the order (T-024).
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
      guestTokenHash,
      acceptedTermsVersion: "2026-11-01",
      ...overrides,
    },
  ]);
  return order!;
}

describe("transition", () => {
  it("moves a paid order to New, auto-accepts it and audits the actor", async () => {
    const order = await createOrder();
    const hook = vi.fn();
    const off = onStatusChanged(hook);

    const change = await transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      { now },
    );
    off();

    const saved = await Order.findById(order._id).lean();
    const logs = await AuditLog.find().lean();
    expect(change).toMatchObject({ from: "awaiting_payment", to: "new" });
    expect(saved).toMatchObject({
      status: "new",
      paidAt: now,
      acceptedAt: now,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "order.payment_succeeded",
      actor: { type: "system", name: "stripe" },
      before: { status: "awaiting_payment" },
      after: { status: "new" },
    });
    expect(hook).toHaveBeenCalledWith(change);
  });

  it("gives one New order when the same webhook arrives twice", async () => {
    const order = await createOrder();
    await transitionWith(allow, order._id, "payment_succeeded", system, {});

    const second = transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      {},
    );

    await expect(second).rejects.toMatchObject({
      name: "InvalidTransition",
      from: "new",
    });
    expect(await Order.countDocuments({ status: "new" })).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it("numbers the order at payment, in the business day of the payment", async () => {
    const order = await createOrder({ businessDate: "2026-11-06" });

    // 06:00 in Budapest (CET): the new business day starts.
    await transitionWith(allow, order._id, "payment_succeeded", system, {
      now: new Date("2026-11-07T05:00:00Z"),
    });

    expect(await Order.findById(order._id).lean()).toMatchObject({
      shortNumber: 1,
      businessDate: "2026-11-07",
    });
  });

  it("keeps a payment at 05:59 in the previous business day", async () => {
    const order = await createOrder({ businessDate: "2026-11-06" });

    await transitionWith(allow, order._id, "payment_succeeded", system, {
      now: new Date("2026-11-07T04:59:00Z"),
    });

    expect(await Order.findById(order._id).lean()).toMatchObject({
      shortNumber: 1,
      businessDate: "2026-11-06",
    });
  });

  it("leaves no gap for an abandoned payment and uses one number per repeated webhook", async () => {
    const abandoned = await createOrder();
    const [paid] = await Order.create([
      {
        ...abandoned.toObject(),
        _id: new Types.ObjectId(),
        guestTokenHash: "b".repeat(64),
      },
    ]);

    await transitionWith(allow, paid!._id, "payment_succeeded", system, {
      now,
    });
    await expect(
      transitionWith(allow, paid!._id, "payment_succeeded", system, { now }),
    ).rejects.toMatchObject({ name: "InvalidTransition" });

    expect((await Order.findById(paid!._id).lean())?.shortNumber).toBe(1);
    expect((await Order.findById(abandoned._id).lean())?.shortNumber).toBe(
      undefined,
    );
    expect((await Counter.findOne().lean())?.seq).toBe(1);
  });

  it("gives the day's first two parallel payments numbers 1 and 2", async () => {
    const first = await createOrder();
    const [second] = await Order.create([
      {
        ...first.toObject(),
        _id: new Types.ObjectId(),
        guestTokenHash: "c".repeat(64),
      },
    ]);

    await Promise.all(
      [first._id, second!._id].map((id) =>
        transitionWith(allow, id, "payment_succeeded", system, { now }),
      ),
    );

    const numbers = (await Order.find().lean()).map((o) => o.shortNumber);
    expect(numbers.sort()).toEqual([1, 2]);
    expect(await Order.countDocuments({ status: "new" })).toBe(2);
  });

  it("lets exactly one of two parallel Ready to Picked up requests succeed", async () => {
    const order = await createOrder({ status: "ready" });
    const pickUp = () =>
      transitionWith(allow, order._id, "pick_up", bartender, { now });

    const results = await Promise.allSettled([pickUp(), pickUp()]);

    const failed = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toBeInstanceOf(InvalidTransition);
    expect(await AuditLog.countDocuments()).toBe(1);
    expect((await Order.findById(order._id).lean())?.pickedUpAt).toEqual(now);
  });

  it("leaves the order unchanged on a forbidden transition", async () => {
    const order = await createOrder({ status: "ready" });
    const hook = vi.fn();
    const off = onStatusChanged(hook);

    const act = transitionWith(allow, order._id, "start_preparing", bartender);

    await expect(act).rejects.toBeInstanceOf(InvalidTransition);
    off();
    const saved = await Order.findById(order._id).lean();
    expect(saved?.status).toBe("ready");
    expect(saved?.updatedAt).toEqual(order.updatedAt);
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(hook).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes the new status once to the order and bar channels after the commit", async () => {
    const order = await createOrder();

    const change = await transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      { now },
    );

    const saved = await Order.findById(order._id).lean();
    const message = {
      orderId: String(order._id),
      status: "new",
      version: saved!.updatedAt.getTime(),
    };
    expect(change.version).toBe(message.version);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(
      `order:${order._id}`,
      "status",
      message,
    );
    expect(publish).toHaveBeenCalledWith(
      `venue:${venueId}:bar:${order.barId}`,
      "status",
      message,
    );
  });

  it("also publishes a VIP order to the venue VIP channel", async () => {
    const order = await createOrder({ isVip: true });

    await transitionWith(allow, order._id, "payment_succeeded", system, {});

    expect(publish).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledWith(
      `venue:${venueId}:vip`,
      "status",
      expect.objectContaining({ status: "new" }),
    );
  });

  it("keeps the status change and reports once when the Ably publish fails", async () => {
    const order = await createOrder();
    const failure = new Error("ably down");
    publish.mockRejectedValue(failure);
    const reportError = vi.fn();

    const change = await transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      { reportError },
    );

    expect(change.to).toBe("new");
    expect((await Order.findById(order._id).lean())?.status).toBe("new");
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(failure);
  });

  it("runs every hook, reports each failure once and never throws to the caller", async () => {
    const order = await createOrder();
    const ablyDown = new Error("ably down");
    const inngestDown = new Error("inngest down");
    publish.mockRejectedValue(ablyDown);
    const failing = onStatusChanged(() => Promise.reject(inngestDown));
    const healthy = vi.fn();
    const off = onStatusChanged(healthy);
    const reportError = vi.fn();

    const change = await transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      { reportError },
    );
    failing();
    off();

    expect(change.to).toBe("new");
    expect((await Order.findById(order._id).lean())?.status).toBe("new");
    expect(healthy).toHaveBeenCalledWith(change);
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledWith(ablyDown);
    expect(reportError).toHaveBeenCalledWith(inngestDown);
  });

  it("reports to the process reporter when the caller passes none", async () => {
    const order = await createOrder();
    const failure = new Error("ably down");
    publish.mockRejectedValue(failure);
    const report = vi.fn();
    setDefaultErrorReporter(report);

    await transitionWith(allow, order._id, "payment_succeeded", system);
    setDefaultErrorReporter(console.error);

    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("stops when authorize denies the actor", async () => {
    const order = await createOrder({ status: "new" });
    const authorize = vi.fn(() => {
      throw new Error("forbidden");
    });

    const act = transitionWith(
      authorize,
      order._id,
      "start_preparing",
      bartender,
    );

    await expect(act).rejects.toThrow("forbidden");
    expect(authorize).toHaveBeenCalledWith(bartender, "order.start", resource);
    expect((await Order.findById(order._id).lean())?.status).toBe("new");
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("asks authorize with the event's action and the order's venue", async () => {
    const order = await createOrder({ status: "ready" });
    const authorize = vi.fn();

    await transitionWith(authorize, order._id, "pick_up", bartender);

    expect(authorize).toHaveBeenCalledExactlyOnceWith(
      bartender,
      "order.pickUp",
      resource,
    );
  });

  it("asks authorize for the VIP hand-over on a VIP order", async () => {
    const order = await createOrder({ status: "ready", isVip: true });
    const authorize = vi.fn();

    await transitionWith(authorize, order._id, "pick_up", bartender);

    expect(authorize).toHaveBeenCalledExactlyOnceWith(
      bartender,
      "order.handOverVip",
      resource,
    );
  });

  it("requires a reason when staff rejects and stores it", async () => {
    const order = await createOrder({ status: "new" });

    const missing = transitionWith(allow, order._id, "reject", bartender, {});
    await expect(missing).rejects.toThrow(/reason/);
    await transitionWith(allow, order._id, "reject", bartender, {
      reason: " Out of gin ",
    });

    const saved = await Order.findById(order._id).lean();
    expect(saved).toMatchObject({
      status: "rejected",
      rejectionReason: "Out of gin",
    });
  });

  it("accepts a manual-acceptance order when the bar starts it", async () => {
    const order = await createOrder({ status: "new" });

    await transitionWith(allow, order._id, "start_preparing", bartender, {
      now,
    });

    const saved = await Order.findById(order._id).lean();
    const log = await AuditLog.findOne().lean();
    expect(saved).toMatchObject({ status: "preparing", acceptedAt: now });
    expect(log?.actor).toMatchObject({
      type: "venue_member",
      id: memberId,
    });
  });

  it("checks the RBAC matrix: a role without the permission gets Forbidden", async () => {
    const order = await createOrder({ status: "new" });
    const vipHost: Actor = { ...bartender, role: "vip_host" } as Actor;

    const denied = transition(order._id, "start_preparing", vipHost);
    await expect(denied).rejects.toBeInstanceOf(Forbidden);
    const change = await transition(order._id, "start_preparing", bartender);

    expect(change).toMatchObject({ from: "new", to: "preparing" });
  });

  it("answers 404 for a missing order and for an order at another venue", async () => {
    const order = await createOrder({ status: "new" });
    const otherVenue: Actor = {
      kind: "staff",
      venueId: new Types.ObjectId().toHexString(),
      memberId: memberId.toHexString(),
      role: "owner",
    };

    // Await each call before starting the next, so the second rejection is never unhandled.
    await expect(
      transition(new Types.ObjectId(), "start_preparing", bartender),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      transition(order._id, "start_preparing", otherVenue),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await Order.findById(order._id).lean())?.status).toBe("new");
  });

  it("lets a guest cancel their own order before acceptance, not another's", async () => {
    const order = await createOrder({ status: "new" });
    const owner: Actor = { kind: "guest", guestId: guestTokenHash };
    const stranger: Actor = { kind: "guest", guestId: "b".repeat(64) };

    const denied = transition(order._id, "reject", stranger);
    await expect(denied).rejects.toBeInstanceOf(NotFoundError);
    const change = await transition(order._id, "reject", owner);

    expect(change).toMatchObject({ from: "new", to: "rejected" });
  });

  it("refunds an expired order automatically when the venue enabled it", async () => {
    const order = await createOrder(
      { status: "expired" },
      { refundOnExpiry: true },
    );
    const inngest: Actor = { kind: "system", source: "inngest" };

    const change = await transition(order._id, "refund", inngest);

    expect(change).toMatchObject({ from: "expired", to: "refunded" });
  });

  it("asks for a reason with a 400 when staff rejects without one", async () => {
    const order = await createOrder({ status: "new" });

    const act = transition(order._id, "reject", bartender);

    await expect(act).rejects.toMatchObject({
      status: 400,
      code: "reason_required",
    });
  });

  it("maps an invalid transition to 409", async () => {
    const order = await createOrder({ status: "ready" });

    const act = transition(order._id, "start_preparing", bartender);

    await expect(act).rejects.toMatchObject({
      status: 409,
      code: "invalid_transition",
    });
  });
});
