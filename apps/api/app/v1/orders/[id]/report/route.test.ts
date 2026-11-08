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
const core = vi.hoisted(() => ({ reportProblem: vi.fn() }));
vi.mock("@namitiszunk/core/orders", () => core);
const send = vi.hoisted(() => vi.fn());
vi.mock("@/src/inngest/client", () => ({
  inngest: { send },
  problemReportedEvent: (orderId: string, index: number) => ({
    name: "order/problem.reported",
    data: { orderId, index },
  }),
}));

const { connectDb } = await import("@namitiszunk/core/api");
const { createGuestToken } = await import("@namitiszunk/auth");
const { AppError } = await import("@namitiszunk/core/errors");
const { POST } = await import("./route");

const orderId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const route = { params: Promise.resolve({ id: orderId }) };
const guest = createGuestToken();
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

const post = (
  token: string,
  body: unknown = { category: "not_received", message: "Nincs ital" },
) =>
  new Request(`https://api.namitiszunk.hu/v1/orders/${orderId}/report`, {
    method: "POST",
    headers: { "x-guest-token": token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-problem-report-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
  core.reportProblem.mockResolvedValue({ index: 1 });
  send.mockResolvedValue(undefined);
  // Inserted raw: only _id and the token hash matter to the guest check.
  await db.connection.collection("orders").insertOne({
    _id: new db.Types.ObjectId(orderId),
    guestTokenHash: guest.hash,
  });
});

describe("POST /v1/orders/{id}/report", () => {
  it("stores the report and queues its mails", async () => {
    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { reported: true } });
    expect(core.reportProblem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guest", guestId: guest.hash }),
      orderId,
      { category: "not_received", message: "Nincs ital" },
    );
    expect(send).toHaveBeenCalledWith({
      name: "order/problem.reported",
      data: { orderId, index: 1 },
    });
  });

  it("refuses a report without a category", async () => {
    const res = await POST(post(guest.token, { message: "x" }), route);

    expect(res.status).toBe(400);
    expect(core.reportProblem).not.toHaveBeenCalled();
  });

  it("answers 404 with another order's token", async () => {
    const res = await POST(post(createGuestToken().token), route);

    expect(res.status).toBe(404);
    expect(core.reportProblem).not.toHaveBeenCalled();
  });

  it("answers 429 for the fourth report", async () => {
    core.reportProblem.mockRejectedValueOnce(
      new AppError(429, "problem_report_limit"),
    );

    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the stored report when queueing the mail fails", async () => {
    send.mockRejectedValueOnce(new Error("inngest down"));

    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(200);
  });
});
