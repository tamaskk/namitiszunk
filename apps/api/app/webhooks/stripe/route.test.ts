import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const { connectDb } = await import("@namitiszunk/core/api");
const webhook = await import("./route");
const connectAccount = await import("@/app/v1/stripe/connect/account/route");

let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("stripe-webhook-test");
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_route_test";
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

describe("POST /webhooks/stripe", () => {
  it("answers an unsigned delivery with 400 invalid_signature and stores nothing", async () => {
    const request = new Request("https://api.namitiszunk.hu/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id: "evt_1", type: "account.updated" }),
      headers: { "stripe-signature": "t=1,v1=forged" },
    });

    const response = await webhook.POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_signature" },
    });
    expect(
      await db.connection.collection("stripeEvents").countDocuments(),
    ).toBe(0);
  });
});

describe("POST /v1/stripe/connect/account", () => {
  it("needs a signed-in caller", async () => {
    const request = new Request(
      "https://api.namitiszunk.hu/v1/stripe/connect/account",
      {
        method: "POST",
        body: JSON.stringify({ venueId: "65a1b2c3d4e5f60718293a4b" }),
        headers: { "content-type": "application/json" },
      },
    );

    const response = await connectAccount.POST(request, {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(401);
  });
});
