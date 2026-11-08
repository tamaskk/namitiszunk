import { Bar, connectDb, Order, Refund, Venue } from "@namitiszunk/db";
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

import { NotFoundError } from "../errors";
import { cancelGuestOrder, getGuestOrder } from "./guest-order";
import { InvalidTransition } from "./state-machine";

vi.mock("server-only", () => ({}));
vi.mock("ably", () => ({
  Rest: class {
    channels = { get: () => ({ publish: () => undefined }) };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

const guestTokenHash = "b".repeat(64);
const guest = { kind: "guest", guestId: guestTokenHash } as const;
const stranger = { kind: "guest", guestId: "c".repeat(64) } as const;

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_guest_order_test"));
  await Order.syncIndexes();
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
  const [venue] = await Venue.create([
    { slug: "pilot", name: "Pilot", orderRules: { autoAccept: false } },
  ]);
  const [bar] = await Bar.create([{ venueId: venue!._id, name: "Főpult" }]);
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: bar!._id,
      shortNumber: 214,
      businessDate: "2026-11-07",
      status: "new",
      items: [
        {
          itemId: new Types.ObjectId(),
          name: "Gin tonic",
          nameEn: "Gin and tonic",
          unitPriceHuf: 2490,
          quantity: 2,
          lineTotalHuf: 4980,
        },
      ],
      subtotalHuf: 4980,
      totalHuf: 4980,
      pickupCode: "K7Q",
      guestTokenHash,
      acceptedTermsVersion: "2026-11-01",
      ...overrides,
    },
  ]);
  return order!;
}

describe("getGuestOrder", () => {
  it("returns the guest's own order with the bar name and no secrets", async () => {
    const order = await createOrder();

    const view = await getGuestOrder(guest, String(order._id));

    expect(view).toEqual({
      id: String(order._id),
      number: "#214",
      status: "new",
      version: order.updatedAt.getTime(),
      items: [
        {
          name: "Gin tonic",
          nameEn: "Gin and tonic",
          quantity: 2,
          lineTotalHuf: 4980,
        },
      ],
      totalHuf: 4980,
      barName: "Főpult",
      isVip: false,
      canCancel: true,
      refundedHuf: 0,
    });
  });

  it("answers 404 for another guest's order", async () => {
    const order = await createOrder();

    await expect(getGuestOrder(stranger, String(order._id))).rejects.toThrow(
      NotFoundError,
    );
  });

  it("sums only succeeded refunds and shows the rejection reason", async () => {
    const order = await createOrder({
      status: "rejected",
      rejectionReason: "Elfogyott",
    });
    const base = {
      venueId: order.venueId,
      paymentId: new Types.ObjectId(),
      orderId: order._id,
      reason: "rejected",
      initiatedBy: { type: "system" as const },
    };
    await Refund.create([
      { ...base, amountHuf: 4980, status: "succeeded" as const },
      { ...base, amountHuf: 100, status: "failed" as const },
    ]);

    const view = await getGuestOrder(guest, String(order._id));

    expect(view).toMatchObject({
      canCancel: false,
      rejectionReason: "Elfogyott",
      refundedHuf: 4980,
    });
  });

  it("does not offer cancel once the order is accepted", async () => {
    const order = await createOrder({ acceptedAt: new Date() });

    const view = await getGuestOrder(guest, String(order._id));

    expect(view.canCancel).toBe(false);
  });
});

describe("cancelGuestOrder", () => {
  it("rejects the guest's unaccepted order", async () => {
    const order = await createOrder();

    const change = await cancelGuestOrder(guest, String(order._id));

    expect(change).toMatchObject({ from: "new", to: "rejected" });
  });

  it("refuses once the bar accepted the order", async () => {
    const order = await createOrder({ acceptedAt: new Date() });

    await expect(cancelGuestOrder(guest, String(order._id))).rejects.toThrow(
      InvalidTransition,
    );
  });
});
