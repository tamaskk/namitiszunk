import {
  connectDb,
  Order,
  type OrderStatus,
  Review,
  Venue,
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

import { ConflictError, NotFoundError } from "../errors";
import { getGuestThanks, submitReview } from "./review";

vi.mock("server-only", () => ({}));

const guestTokenHash = "c3".repeat(32);
const guest = { kind: "guest", guestId: guestTokenHash } as const;
const stranger = { kind: "guest", guestId: "d4".repeat(32) } as const;

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_review_test"));
  await Review.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all([Order, Venue, Review].map((m) => m.deleteMany()));
});

async function createOrder(status: OrderStatus = "picked_up") {
  const [venue] = await Venue.create([{ slug: "pilot", name: "Pilot" }]);
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: new Types.ObjectId(),
      shortNumber: 214,
      businessDate: "2026-11-07",
      status,
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
    },
  ]);
  return order!;
}

describe("submitReview", () => {
  it("stores one rating for a picked-up order and refuses a second", async () => {
    const order = await createOrder();

    await submitReview(guest, String(order._id), {
      stars: 5,
      text: "Gyors volt",
    });
    const again = submitReview(guest, String(order._id), { stars: 1 });

    await expect(again).rejects.toMatchObject({
      status: 409,
      code: "already_reviewed",
    });
    const reviews = await Review.find({ orderId: order._id }).lean();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      venueId: order.venueId,
      stars: 5,
      text: "Gyors volt",
    });
  });

  it("refuses a rating before the order is picked up", async () => {
    const order = await createOrder("ready");

    const act = submitReview(guest, String(order._id), { stars: 4 });

    await expect(act).rejects.toThrow(ConflictError);
    expect(await Review.countDocuments()).toBe(0);
  });

  it("answers 404 for another guest's order", async () => {
    const order = await createOrder();

    const act = submitReview(stranger, String(order._id), { stars: 4 });

    await expect(act).rejects.toThrow(NotFoundError);
  });
});

describe("getGuestThanks", () => {
  it("tells whether the guest already rated the order", async () => {
    const order = await createOrder();

    const before = await getGuestThanks(guest, String(order._id));
    await submitReview(guest, String(order._id), { stars: 4 });
    const after = await getGuestThanks(guest, String(order._id));

    expect(before.reviewed).toBe(false);
    expect(after).toMatchObject({
      reviewed: true,
      order: { status: "picked_up" },
    });
  });

  it("links back to the same venue's menu and bar for another round", async () => {
    const order = await createOrder();

    const thanks = await getGuestThanks(guest, String(order._id));

    expect(thanks.menu).toEqual({
      venueSlug: (await Venue.findById(order.venueId).lean())?.slug,
      barId: String(order.barId),
    });
  });
});
