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
// The core service has its own tests (packages/core/src/payments/payments.test.ts); here it is the boundary.
const core = vi.hoisted(() => ({
  createOrder: vi.fn(),
  reissueOrderPayment: vi.fn(),
}));
vi.mock("@namitiszunk/core/payments", () => core);
const send = vi.hoisted(() => vi.fn());
vi.mock("@/src/inngest/client", () => ({
  inngest: { send },
  orderCreatedEvent: (orderId: string, venueId: string) => ({
    name: "order/created",
    data: { orderId, venueId },
  }),
}));

const { connectDb } = await import("@namitiszunk/core/api");
const { ConflictError, AppError } = await import("@namitiszunk/core/errors");
const { hashGuestToken } = await import("@namitiszunk/auth");
const { POST } = await import("@/app/v1/orders/route");

const route = { params: Promise.resolve({}) };
const orderId = "c".repeat(24);
const venueId = "d".repeat(24);
const sessionId = "s".repeat(22);
const body = {
  barId: "b".repeat(24),
  items: [{ itemId: "e".repeat(24), quantity: 1 }],
  tip: { type: "percent", bps: 0 },
  smsRequested: false,
  acceptedTermsVersion: "2026-11-01",
};

/** `null` leaves a default header out. */
function post(payload: unknown, overrides: Record<string, string | null> = {}) {
  const headers = Object.entries({
    "content-type": "application/json",
    "x-forwarded-for": "203.0.113.7",
    "idempotency-key": "checkout-1",
    "x-session-id": sessionId,
    ...overrides,
  }).filter((entry): entry is [string, string] => entry[1] !== null);
  return new Request("https://api.namitiszunk.hu/v1/orders", {
    method: "POST",
    body: JSON.stringify(payload),
    headers,
  });
}

let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("orders-route-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.connection.dropDatabase();
  await Promise.all(
    Object.values(db.connection.models).map((model) => model.syncIndexes()),
  );
  core.createOrder.mockImplementation(async (_input, options) => {
    await options.onOrderCreated({ orderId, venueId });
    return { orderId, clientSecret: "pi_1_secret_x" };
  });
});

describe("POST /v1/orders", () => {
  it("creates the order, starts its payment timeout and returns the raw guest token once", async () => {
    const res = await POST(post(body), route);

    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ orderId, clientSecret: "pi_1_secret_x" });
    const [, options] = core.createOrder.mock.calls[0]!;
    expect(options.guestTokenHash).toBe(hashGuestToken(data.guestToken));
    expect(send).toHaveBeenCalledWith({
      name: "order/created",
      data: { orderId, venueId },
    });
  });

  it("answers a double tap with the same order and PaymentIntent, never a second one", async () => {
    core.reissueOrderPayment.mockResolvedValue({
      orderId,
      clientSecret: "pi_1_secret_x",
    });

    const first = await POST(post(body), route);
    const second = await POST(post(body), route);

    expect(core.createOrder).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    const [a, b] = [(await first.json()).data, (await second.json()).data];
    expect(b).toMatchObject({ orderId, clientSecret: "pi_1_secret_x" });
    // The stored replay holds no token; the repeat gets a fresh one bound to the same order.
    expect(core.reissueOrderPayment).toHaveBeenCalledWith(
      orderId,
      hashGuestToken(b.guestToken),
      undefined,
    );
    expect(b.guestToken).not.toBe(a.guestToken);
  });

  it("answers a replay after payment with the order id only, without a new token or secret", async () => {
    core.reissueOrderPayment.mockResolvedValue({ orderId });

    await POST(post(body), route);
    const second = await POST(post(body), route);

    expect(second.status).toBe(201);
    expect((await second.json()).data).toEqual({ orderId });
  });

  it("requires an Idempotency-Key", async () => {
    const res = await POST(post(body, { "idempotency-key": null }), route);

    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({
      "Idempotency-Key": "required",
    });
    expect(core.createOrder).not.toHaveBeenCalled();
  });

  it("rejects an invalid cart before the service runs", async () => {
    const res = await POST(post({ ...body, items: [] }), route);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
    expect(core.createOrder).not.toHaveBeenCalled();
  });

  it("passes a sold-out item through as 409 with its path, and the key can be retried", async () => {
    core.createOrder.mockRejectedValueOnce(
      new AppError(409, "items_unavailable", {
        "items.0.itemId": "unavailable",
      }),
    );

    const res = await POST(post(body), route);
    const retry = await POST(post(body), route);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "items_unavailable",
      fields: { "items.0.itemId": "unavailable" },
    });
    expect(retry.status).toBe(201);
  });

  it("maps a paused bar to 409", async () => {
    core.createOrder.mockRejectedValueOnce(new ConflictError("bar_paused"));

    const res = await POST(post(body), route);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("bar_paused");
  });

  it("rate limits one client address", async () => {
    // Fixed-window limiter: pin the clock inside one window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T22:00:10Z"));
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(post(body, { "idempotency-key": `k-${i}` }), route);
    }

    vi.useRealTimers();
    expect(last!.status).toBe(429);
  });
});
