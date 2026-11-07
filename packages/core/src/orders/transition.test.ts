import { AuditLog, connectDb, Order, Venue } from "@namitiszunk/db";
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

import { InvalidTransition } from "./state-machine";
import { type OrderActor, transition } from "./transition";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

const now = new Date("2026-11-07T22:00:00Z");
const system: OrderActor = { kind: "system", name: "stripe-webhook" };
const bartender: OrderActor = {
  kind: "staff",
  role: "bartender",
  memberId: new Types.ObjectId(),
  name: "Anna",
};
const allow = () => {};

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_transition_test"));
  await Promise.all([Order.syncIndexes(), AuditLog.syncIndexes()]);
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

async function createOrder(overrides: Record<string, unknown> = {}) {
  const [venue] = await Venue.create([{ slug: "pilot", name: "Pilot" }]);
  // Fixtures may set a status directly; app code may not (no-status-writes.test.ts).
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: new Types.ObjectId(),
      shortNumber: 1,
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
      guestTokenHash: new Types.ObjectId().toHexString(),
      acceptedTermsVersion: "2026-11-01",
      ...overrides,
    },
  ]);
  return order!;
}

describe("transition", () => {
  it("moves a paid order to New, auto-accepts it and audits the actor", async () => {
    const order = await createOrder();
    const afterCommit = vi.fn();

    const change = await transition(order._id, "payment_succeeded", system, {
      authorize: allow,
      afterCommit,
      now,
    });

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
      actor: { type: "system", name: "stripe-webhook" },
      before: { status: "awaiting_payment" },
      after: { status: "new" },
    });
    expect(afterCommit).toHaveBeenCalledWith(change);
  });

  it("gives one New order when the same webhook arrives twice", async () => {
    const order = await createOrder();
    await transition(order._id, "payment_succeeded", system, {
      authorize: allow,
    });

    const second = transition(order._id, "payment_succeeded", system, {
      authorize: allow,
    });

    await expect(second).rejects.toMatchObject({
      name: "InvalidTransition",
      from: "new",
    });
    expect(await Order.countDocuments({ status: "new" })).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it("lets exactly one of two parallel Ready to Picked up requests succeed", async () => {
    const order = await createOrder({ status: "ready" });
    const pickUp = () =>
      transition(order._id, "pick_up", bartender, { authorize: allow, now });

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
    const afterCommit = vi.fn();

    const act = transition(order._id, "start_preparing", bartender, {
      authorize: allow,
      afterCommit,
    });

    await expect(act).rejects.toBeInstanceOf(InvalidTransition);
    const saved = await Order.findById(order._id).lean();
    expect(saved?.status).toBe("ready");
    expect(saved?.updatedAt).toEqual(order.updatedAt);
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it("stops when authorize denies the actor", async () => {
    const order = await createOrder({ status: "new" });
    const authorize = vi.fn(() => {
      throw new Error("forbidden");
    });

    const act = transition(order._id, "start_preparing", bartender, {
      authorize,
    });

    await expect(act).rejects.toThrow("forbidden");
    expect(authorize).toHaveBeenCalledWith(
      bartender,
      "order.start_preparing",
      order.venueId,
    );
    expect((await Order.findById(order._id).lean())?.status).toBe("new");
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("asks authorize with the event's action and the order's venue", async () => {
    const order = await createOrder({ status: "ready" });
    const authorize = vi.fn();

    await transition(order._id, "pick_up", bartender, { authorize });

    expect(authorize).toHaveBeenCalledExactlyOnceWith(
      bartender,
      "order.pick_up",
      order.venueId,
    );
  });

  it("requires a reason when staff rejects and stores it", async () => {
    const order = await createOrder({ status: "new" });

    const missing = transition(order._id, "reject", bartender, {
      authorize: allow,
    });
    await expect(missing).rejects.toThrow(/reason/);
    await transition(order._id, "reject", bartender, {
      authorize: allow,
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

    await transition(order._id, "start_preparing", bartender, {
      authorize: allow,
      now,
    });

    const saved = await Order.findById(order._id).lean();
    const log = await AuditLog.findOne().lean();
    expect(saved).toMatchObject({ status: "preparing", acceptedAt: now });
    expect(log?.actor).toMatchObject({
      type: "venue_member",
      id: bartender.kind === "staff" ? bartender.memberId : undefined,
      name: "Anna",
    });
  });
});
