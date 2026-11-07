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
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session-actor", () => ({ getSessionActor: session }));
// The service is tested in @namitiszunk/core (payments/refund.test.ts); here only the wiring.
const core = vi.hoisted(() => ({
  assertMayRefund: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock("@namitiszunk/core/payments", () => core);

const { connectDb } = await import("@namitiszunk/core/api");
const { Forbidden } = await import("@namitiszunk/core/auth");
const { ConflictError } = await import("@namitiszunk/core/errors");
const { POST } = await import("./route");

const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const route = { params: Promise.resolve({ id: orderId }) };
const manager = {
  kind: "user" as const,
  userId: "6a0f1c2b3d4e5f6a7b8c9d01",
  memberships: [],
  id: "manager",
};
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

function post(body: unknown, key?: string) {
  return new Request(
    `https://api.namitiszunk.hu/v1/orders/${orderId}/refunds`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(key && { "idempotency-key": key }),
      },
    },
  );
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-refund-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  // The unique key index is what makes a repeated Idempotency-Key a replay.
  await Promise.all(
    Object.values(db.connection.models).map((model) => model.syncIndexes()),
  );
  vi.clearAllMocks();
  session.mockResolvedValue(manager);
  core.refundOrder.mockResolvedValue({
    refundId: "6a0f1c2b3d4e5f6a7b8c9d0f",
    amountHuf: 1000,
    status: "pending",
  });
});

describe("POST /v1/orders/{id}/refunds", () => {
  it("refunds once for the same Idempotency-Key and replays the answer", async () => {
    const body = { amountHuf: 1000, reason: "Missing ice" };

    const first = await POST(post(body, "refund-key-1"), route);
    const second = await POST(post(body, "refund-key-1"), route);

    expect(first.status).toBe(200);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
    expect(core.refundOrder).toHaveBeenCalledTimes(1);
    expect(core.refundOrder).toHaveBeenCalledWith(
      orderId,
      1000,
      "Missing ice",
      manager,
    );
  });

  it("answers 403 when the caller may not refund, before the service runs", async () => {
    core.assertMayRefund.mockRejectedValueOnce(new Forbidden("order.refund"));

    const response = await POST(
      post({ amountHuf: "full", reason: "x" }),
      route,
    );

    expect(response.status).toBe(403);
    expect(core.assertMayRefund).toHaveBeenCalledWith(orderId, manager, "full");
    expect(core.refundOrder).not.toHaveBeenCalled();
  });

  it("answers 409 when the amount exceeds what is left", async () => {
    core.refundOrder.mockRejectedValue(
      new ConflictError("refund_exceeds_remaining"),
    );

    const response = await POST(post({ amountHuf: 5000, reason: "x" }), route);

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("refund_exceeds_remaining");
  });

  it("answers 400 for a fractional amount and 401 without a session", async () => {
    expect(
      (await POST(post({ amountHuf: 1.5, reason: "x" }), route)).status,
    ).toBe(400);
    session.mockResolvedValue(null);
    expect(
      (await POST(post({ amountHuf: 1, reason: "x" }), route)).status,
    ).toBe(401);
  });
});
