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
// The service is tested in @namitiszunk/core (orders/guest-order.test.ts); here only the wiring.
const core = vi.hoisted(() => ({
  cancelGuestOrder: vi.fn(),
  getGuestOrder: vi.fn(),
}));
vi.mock("@namitiszunk/core/orders", () => core);

const { connectDb } = await import("@namitiszunk/core/api");
const { createGuestToken } = await import("@namitiszunk/auth");
const { ConflictError } = await import("@namitiszunk/core/errors");
const { POST } = await import("./route");

const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const route = { params: Promise.resolve({ id: orderId }) };
const guest = createGuestToken();
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

const post = (token: string) =>
  new Request(`https://api.namitiszunk.hu/v1/orders/${orderId}/cancel`, {
    method: "POST",
    headers: { "x-guest-token": token },
  });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-guest-cancel-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
  core.cancelGuestOrder.mockResolvedValue({ from: "new", to: "rejected" });
  core.getGuestOrder.mockResolvedValue({ id: orderId, status: "rejected" });
  // Inserted raw: only _id and the token hash matter to the guest check.
  await db.connection.collection("orders").insertOne({
    _id: new db.Types.ObjectId(orderId),
    guestTokenHash: guest.hash,
  });
});

describe("POST /v1/orders/{id}/cancel", () => {
  it("cancels the guest's order and answers the new view", async () => {
    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { id: orderId, status: "rejected" },
    });
    expect(core.cancelGuestOrder).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guest", guestId: guest.hash }),
      orderId,
    );
  });

  it("answers 404 with another order's token and cancels nothing", async () => {
    const res = await POST(post(createGuestToken().token), route);

    expect(res.status).toBe(404);
    expect(core.cancelGuestOrder).not.toHaveBeenCalled();
  });

  it("answers 409 once the order can no longer be cancelled", async () => {
    core.cancelGuestOrder.mockRejectedValueOnce(
      new ConflictError("invalid_transition"),
    );

    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(409);
    expect(core.getGuestOrder).not.toHaveBeenCalled();
  });
});
