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

import { type Actor, Forbidden } from "../auth/permissions";
import { NotFoundError } from "../errors";
import { InvalidTransition } from "./state-machine";
import { transition, transitionWith } from "./transition";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

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
    const afterCommit = vi.fn();

    const change = await transitionWith(
      allow,
      order._id,
      "payment_succeeded",
      system,
      { afterCommit, now },
    );

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
    expect(afterCommit).toHaveBeenCalledWith(change);
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
    const afterCommit = vi.fn();

    const act = transitionWith(allow, order._id, "start_preparing", bartender, {
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

    const missing = transition(
      new Types.ObjectId(),
      "start_preparing",
      bartender,
    );
    const elsewhere = transition(order._id, "start_preparing", otherVenue);

    await expect(missing).rejects.toBeInstanceOf(NotFoundError);
    await expect(elsewhere).rejects.toBeInstanceOf(NotFoundError);
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
