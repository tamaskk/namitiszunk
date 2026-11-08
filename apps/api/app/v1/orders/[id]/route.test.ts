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
const core = vi.hoisted(() => ({ getGuestOrder: vi.fn() }));
vi.mock("@namitiszunk/core/orders", () => core);

const { connectDb } = await import("@namitiszunk/core/api");
const { createGuestToken } = await import("@namitiszunk/auth");
const { GET } = await import("./route");

const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const route = { params: Promise.resolve({ id: orderId }) };
const guest = createGuestToken();
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

const get = (token?: string) =>
  new Request(`https://api.namitiszunk.hu/v1/orders/${orderId}`, {
    headers: token ? { "x-guest-token": token } : {},
  });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-guest-order-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
  core.getGuestOrder.mockResolvedValue({ id: orderId, status: "new" });
  // Inserted raw: only _id and the token hash matter to the guest check.
  await db.connection.collection("orders").insertOne({
    _id: new db.Types.ObjectId(orderId),
    guestTokenHash: guest.hash,
  });
});

describe("GET /v1/orders/{id}", () => {
  it("answers the order to the guest holding its token", async () => {
    const res = await GET(get(guest.token), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: orderId, status: "new" } });
    expect(core.getGuestOrder).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guest", guestId: guest.hash }),
      orderId,
    );
  });

  it("answers 404 without a token", async () => {
    const res = await GET(get(), route);

    expect(res.status).toBe(404);
    expect(core.getGuestOrder).not.toHaveBeenCalled();
  });

  it("answers 404 with another order's token", async () => {
    const res = await GET(get(createGuestToken().token), route);

    expect(res.status).toBe(404);
    expect(core.getGuestOrder).not.toHaveBeenCalled();
  });
});
