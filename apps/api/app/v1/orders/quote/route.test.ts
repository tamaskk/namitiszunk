import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// The service is tested in @namitiszunk/core (payments/payments.test.ts); here only the wiring.
const core = vi.hoisted(() => ({ quoteOrder: vi.fn() }));
vi.mock("@namitiszunk/core/payments", () => core);

const { connectDb } = await import("@namitiszunk/core/api");
const { ConflictError } = await import("@namitiszunk/core/errors");
const { POST } = await import("./route");

const cart = {
  barId: "6a0f1c2b3d4e5f6a7b8c9d0e",
  items: [{ itemId: "6a0f1c2b3d4e5f6a7b8c9d0f", quantity: 2 }],
  tip: { type: "percent", bps: 1000 },
  smsRequested: false,
};
const quote = {
  lines: [{ name: "Gin tonic", options: [], quantity: 2, lineTotalHuf: 4980 }],
  subtotalHuf: 4980,
  discountHuf: 0,
  serviceFeeHuf: 0,
  tipHuf: 498,
  totalHuf: 5478,
  stripeAccountId: "acct_1TestVenue",
  termsVersion: "draft-2026-11",
};
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

const post = (body: unknown) =>
  new Request("https://api.namitiszunk.hu/v1/orders/quote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(body),
  });
const route = { params: Promise.resolve({}) };

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-quote-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
  core.quoteOrder.mockResolvedValue(quote);
});

describe("POST /v1/orders/quote", () => {
  it("answers the server's price for the cart", async () => {
    const res = await POST(post(cart), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: quote });
    expect(core.quoteOrder).toHaveBeenCalledWith(
      cart,
      expect.any(Date),
      "203.0.113.7",
    );
  });

  it("refuses a cart without items", async () => {
    const res = await POST(post({ ...cart, items: [] }), route);

    expect(res.status).toBe(400);
    expect(core.quoteOrder).not.toHaveBeenCalled();
  });

  it("passes on a paused bar as 409", async () => {
    core.quoteOrder.mockRejectedValueOnce(new ConflictError("bar_paused"));

    const res = await POST(post(cart), route);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "bar_paused" } });
  });
});
