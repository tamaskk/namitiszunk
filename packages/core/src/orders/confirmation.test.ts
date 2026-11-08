import { connectDb, Order, Payment, Refund, Venue } from "@namitiszunk/db";
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
import {
  CONFIRMATION_EMAIL_LIMIT,
  getGuestConfirmation,
  requestConfirmationEmail,
} from "./confirmation";

vi.mock("server-only", () => ({}));

const guestTokenHash = "d".repeat(64);
const guest = { kind: "guest", guestId: guestTokenHash } as const;
const stranger = { kind: "guest", guestId: "e".repeat(64) } as const;
const paidAt = new Date("2026-11-07T22:10:00Z");
const emailInput = {
  email: "vendeg@example.com",
  locale: "hu",
  url: "https://rendel.namitiszunk.hu/hu/r/x?t=y",
};

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_confirmation_test"));
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

async function createPaidOrder(overrides: Record<string, unknown> = {}) {
  const [venue] = await Venue.create([
    {
      slug: "pilot",
      name: "Pilot Club",
      company: { name: "Pilot Kft.", taxNumber: "12345678-2-42" },
      address: { street: "Király u. 1.", city: "Budapest", postalCode: "1061" },
    },
  ]);
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: new Types.ObjectId(),
      shortNumber: 214,
      businessDate: "2026-11-07",
      status: "picked_up",
      items: [
        {
          itemId: new Types.ObjectId(),
          name: "Gin tonic",
          unitPriceHuf: 2490,
          quantity: 2,
          options: [
            { groupName: "Gin", name: "Hendrick's", priceDeltaHuf: 500 },
          ],
          lineTotalHuf: 5980,
        },
      ],
      subtotalHuf: 5980,
      discountHuf: 500,
      serviceFeeHuf: 300,
      tipHuf: 200,
      totalHuf: 5980,
      pickupCode: "K7Q",
      guestTokenHash,
      acceptedTermsVersion: "2026-11-01",
      paidAt,
      ...overrides,
    },
  ]);
  return { venue: venue!, order: order! };
}

describe("getGuestConfirmation", () => {
  it("assembles items, totals, payment method and the venue's company data", async () => {
    const { venue, order } = await createPaidOrder();
    await Payment.create({
      venueId: venue._id,
      orderId: order._id,
      stripePaymentIntentId: "pi_1",
      amountHuf: 5980,
      status: "succeeded",
      cardBrand: "visa",
      cardLast4: "4242",
    });

    const confirmation = await getGuestConfirmation(guest, String(order._id));

    expect(confirmation).toMatchObject({
      number: "#214",
      items: [
        {
          name: "Gin tonic",
          options: ["Hendrick's"],
          quantity: 2,
          unitPriceHuf: 2490,
          lineTotalHuf: 5980,
        },
      ],
      subtotalHuf: 5980,
      discountHuf: 500,
      serviceFeeHuf: 300,
      tipHuf: 200,
      totalHuf: 5980,
      paidAt,
      method: { brand: "visa", last4: "4242" },
      venue: {
        name: "Pilot Club",
        companyName: "Pilot Kft.",
        taxNumber: "12345678-2-42",
        address: "1061 Budapest Király u. 1.",
      },
      refunds: [],
    });
    expect(confirmation).not.toHaveProperty("vat");
  });

  it("lists succeeded refunds with their amount and time", async () => {
    const { venue, order } = await createPaidOrder({ status: "refunded" });
    const base = {
      venueId: venue._id,
      paymentId: new Types.ObjectId(),
      orderId: order._id,
      reason: "x",
      initiatedBy: { type: "system" as const },
    };
    await Refund.create([
      { ...base, amountHuf: 5980, status: "succeeded" as const },
      { ...base, amountHuf: 100, status: "failed" as const },
    ]);

    const confirmation = await getGuestConfirmation(guest, String(order._id));

    expect(confirmation.refunds).toEqual([
      { amountHuf: 5980, at: expect.any(Date) },
    ]);
    expect(confirmation.method).toBeNull();
  });

  it("answers 404 for another guest and for an order never paid", async () => {
    const { order } = await createPaidOrder();
    await Order.updateOne({ _id: order._id }, { $unset: { paidAt: 1 } });

    const forStranger = getGuestConfirmation(stranger, String(order._id));
    const unpaid = getGuestConfirmation(guest, String(order._id));

    await expect(forStranger).rejects.toThrow(NotFoundError);
    await expect(unpaid).rejects.toThrow(NotFoundError);
  });
});

describe("requestConfirmationEmail", () => {
  it("sends the confirmation with its link and refuses the fourth request", async () => {
    const { order } = await createPaidOrder();
    const send = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < CONFIRMATION_EMAIL_LIMIT; i++)
      await requestConfirmationEmail(
        guest,
        String(order._id),
        emailInput,
        send,
      );
    const fourth = requestConfirmationEmail(
      guest,
      String(order._id),
      emailInput,
      send,
    );

    await expect(fourth).rejects.toMatchObject({
      status: 429,
      code: "confirmation_email_limit",
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]![0]).toMatchObject({
      template: "orderConfirmation",
      to: "vendeg@example.com",
      data: { shortNumber: "#214", confirmationUrl: emailInput.url },
    });
  });

  it("gives the count back when sending fails", async () => {
    const { order } = await createPaidOrder();
    const failing = vi.fn().mockRejectedValue(new Error("resend down"));

    await expect(
      requestConfirmationEmail(guest, String(order._id), emailInput, failing),
    ).rejects.toThrow("resend down");

    const saved = await Order.findById(order._id).lean();
    expect(saved?.confirmationEmailCount).toBe(0);
  });

  it("sends nothing for another guest's order", async () => {
    const { order } = await createPaidOrder();
    const send = vi.fn();

    await expect(
      requestConfirmationEmail(stranger, String(order._id), emailInput, send),
    ).rejects.toThrow(NotFoundError);
    expect(send).not.toHaveBeenCalled();
  });
});
