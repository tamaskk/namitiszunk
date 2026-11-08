import { Bar, connectDb, Order, Venue } from "@namitiszunk/db";
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
  PROBLEM_REPORT_LIMIT,
  problemReportMails,
  reportProblem,
} from "./problem-report";

vi.mock("server-only", () => ({}));

const guestTokenHash = "a1".repeat(32);
const guest = { kind: "guest", guestId: guestTokenHash } as const;
const stranger = { kind: "guest", guestId: "b2".repeat(32) } as const;
const now = new Date("2026-11-07T23:00:00Z");
const links = {
  platformEmail: "ops@namitiszunk.hu",
  adminOrder: (id: string) => `https://admin.namitiszunk.hu/orders/${id}`,
};

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_problem_test"));
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
  contactEmail: string | null = "bar@pilot.example",
) {
  const [venue] = await Venue.create([
    {
      slug: "pilot",
      name: "Pilot Club",
      ...(contactEmail && { contactEmail }),
    },
  ]);
  const [bar] = await Bar.create([{ venueId: venue!._id, name: "Főpult" }]);
  const [order] = await Order.create([
    {
      venueId: venue!._id,
      barId: bar!._id,
      shortNumber: 214,
      businessDate: "2026-11-07",
      status: "ready",
      items: [
        {
          itemId: new Types.ObjectId(),
          name: "Gin tonic",
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
      paidAt: now,
      ...overrides,
    },
  ]);
  return order!;
}

describe("reportProblem", () => {
  it("stores the report on the order and refuses the fourth with 429", async () => {
    const order = await createOrder();
    const input = { category: "not_received" as const, message: "Nincs ital" };

    const indexes = [];
    for (let i = 0; i < PROBLEM_REPORT_LIMIT; i++)
      indexes.push(
        (await reportProblem(guest, String(order._id), input, now)).index,
      );
    const fourth = reportProblem(guest, String(order._id), input, now);

    await expect(fourth).rejects.toMatchObject({
      status: 429,
      code: "problem_report_limit",
    });
    expect(indexes).toEqual([0, 1, 2]);
    const saved = await Order.findById(order._id).lean();
    expect(saved?.problemReports).toHaveLength(3);
    expect(saved?.problemReports?.[0]).toMatchObject({
      category: "not_received",
      message: "Nincs ital",
      createdAt: now,
    });
  });

  it("never stores more than the limit under parallel requests", async () => {
    const order = await createOrder();

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reportProblem(guest, String(order._id), { category: "other" }, now),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const saved = await Order.findById(order._id).lean();
    expect(saved?.problemReports).toHaveLength(3);
  });

  it("answers 404 for another guest and for an unpaid order", async () => {
    const order = await createOrder({
      paidAt: undefined,
      status: "awaiting_payment",
    });

    await expect(
      reportProblem(stranger, String(order._id), {
        category: "other",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      reportProblem(guest, String(order._id), {
        category: "other",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("problemReportMails", () => {
  it("mails the venue and the platform with the order, bar, status, total and the report", async () => {
    const order = await createOrder();
    await reportProblem(
      guest,
      String(order._id),
      {
        category: "wrong_order",
        message: "Rossz ital",
        email: "g@example.com",
      },
      now,
    );

    const mails = await problemReportMails(String(order._id), 0, links);

    expect(mails.map((m) => m.to)).toEqual([
      "bar@pilot.example",
      "ops@namitiszunk.hu",
    ]);
    expect(mails[0]!.data).toEqual({
      locale: "hu",
      venueName: "Pilot Club",
      barName: "Főpult",
      shortNumber: "#214",
      status: "ready",
      totalHuf: 4980,
      category: "wrong_order",
      message: "Rossz ital",
      guestEmail: "g@example.com",
      adminUrl: `https://admin.namitiszunk.hu/orders/${String(order._id)}`,
      platformEmail: "ops@namitiszunk.hu",
    });
  });

  it("still mails the platform when the venue has no contact address", async () => {
    const order = await createOrder({}, null);
    await reportProblem(guest, String(order._id), { category: "payment" }, now);

    const mails = await problemReportMails(String(order._id), 0, links);

    expect(mails.map((m) => m.to)).toEqual(["ops@namitiszunk.hu"]);
  });
});
