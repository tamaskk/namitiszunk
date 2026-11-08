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
const core = vi.hoisted(() => ({ requestConfirmationEmail: vi.fn() }));
vi.mock("@namitiszunk/core/orders", () => core);
vi.mock("@namitiszunk/emails", () => ({ sendEmail: vi.fn() }));

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
  body: unknown = { email: "a@example.com", locale: "hu" },
) =>
  new Request(
    `https://api.namitiszunk.hu/v1/orders/${orderId}/confirmation-email`,
    {
      method: "POST",
      headers: { "x-guest-token": token, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-confirmation-email-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
  core.requestConfirmationEmail.mockResolvedValue(undefined);
  // Inserted raw: only _id and the token hash matter to the guest check.
  await db.connection.collection("orders").insertOne({
    _id: new db.Types.ObjectId(orderId),
    guestTokenHash: guest.hash,
  });
});

describe("POST /v1/orders/{id}/confirmation-email", () => {
  it("sends the confirmation with a link that carries the guest's token", async () => {
    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { sent: true } });
    expect(core.requestConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "guest", guestId: guest.hash }),
      orderId,
      {
        email: "a@example.com",
        locale: "hu",
        url: `https://rendel.namitiszunk.hu/hu/r/${orderId}?t=${guest.token}`,
      },
      expect.any(Function),
    );
  });

  it("answers 404 with another order's token", async () => {
    const res = await POST(post(createGuestToken().token), route);

    expect(res.status).toBe(404);
    expect(core.requestConfirmationEmail).not.toHaveBeenCalled();
  });

  it("refuses an invalid address", async () => {
    const res = await POST(
      post(guest.token, { email: "nope", locale: "hu" }),
      route,
    );

    expect(res.status).toBe(400);
    expect(core.requestConfirmationEmail).not.toHaveBeenCalled();
  });

  it("answers 429 after the third e-mail", async () => {
    core.requestConfirmationEmail.mockRejectedValueOnce(
      new AppError(429, "confirmation_email_limit"),
    );

    const res = await POST(post(guest.token), route);

    expect(res.status).toBe(429);
  });
});
