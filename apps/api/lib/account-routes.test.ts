import { createHash } from "node:crypto";

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

import type { SessionActor } from "./session-actor";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const getSessionActor = vi.hoisted(() =>
  vi.fn<(request: Request) => Promise<SessionActor | null>>(),
);
vi.mock("./session-actor", () => ({ getSessionActor }));
// The services are tested in @namitiszunk/core (account/account.test.ts); here only the wiring.
const core = vi.hoisted(() => ({
  claimDeviceOrders: vi.fn(),
  deleteAccount: vi.fn(),
  exportAccountData: vi.fn(),
  listAccountOrders: vi.fn(),
  reorder: vi.fn(),
}));
vi.mock("@namitiszunk/core/account", () => core);

const { connectDb } = await import("@namitiszunk/core/api");
const { ConflictError } = await import("@namitiszunk/core/errors");
const me = await import("@/app/v1/me/route");
const claim = await import("@/app/v1/me/orders/claim/route");

const orderOrigin = "https://rendel.namitiszunk.hu";
const route = { params: Promise.resolve({}) };
const guestUser: SessionActor = {
  id: "u1",
  kind: "user",
  userId: "a".repeat(24),
  memberships: [],
};

function request(
  path: string,
  method: string,
  { origin = orderOrigin, body }: { origin?: string; body?: unknown } = {},
) {
  return new Request(`https://api.namitiszunk.hu${path}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("account-routes-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  vi.clearAllMocks();
});

describe("/v1/me", () => {
  it("answers 401 without a session and never reaches the service", async () => {
    getSessionActor.mockResolvedValue(null);

    const res = await me.DELETE(request("/v1/me", "DELETE"), route);

    expect(res.status).toBe(401);
    expect(core.deleteAccount).not.toHaveBeenCalled();
  });

  it("answers 401 to a staff PIN session and to an admin-app session", async () => {
    getSessionActor.mockResolvedValue({
      id: "m1",
      kind: "staff",
      venueId: "b".repeat(24),
      memberId: "m1",
      role: "bartender",
    } as SessionActor);
    const staff = await me.DELETE(request("/v1/me", "DELETE"), route);
    getSessionActor.mockResolvedValue(guestUser);

    const admin = await me.DELETE(
      request("/v1/me", "DELETE", { origin: "https://admin.namitiszunk.hu" }),
      route,
    );

    expect(staff.status).toBe(401);
    expect(admin.status).toBe(401);
    expect(core.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the signed-in guest's own account", async () => {
    getSessionActor.mockResolvedValue(guestUser);
    core.deleteAccount.mockResolvedValue({ ordersDetached: 2 });

    const res = await me.DELETE(request("/v1/me", "DELETE"), route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ordersDetached: 2 } });
    expect(core.deleteAccount).toHaveBeenCalledWith(guestUser);
  });

  it("answers 409 staff_account for a staff user", async () => {
    getSessionActor.mockResolvedValue(guestUser);
    core.deleteAccount.mockRejectedValue(new ConflictError("staff_account"));

    const res = await me.DELETE(request("/v1/me", "DELETE"), route);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "staff_account" },
    });
  });
});

describe("POST /v1/me/orders/claim", () => {
  it("hands core only the hash of each guest token", async () => {
    getSessionActor.mockResolvedValue(guestUser);
    core.claimDeviceOrders.mockResolvedValue({ claimed: 1 });
    const token = "t".repeat(22);

    const res = await claim.POST(
      request("/v1/me/orders/claim", "POST", {
        body: { orders: [{ orderId: "c".repeat(24), token }] },
      }),
      route,
    );

    expect(res.status).toBe(200);
    expect(core.claimDeviceOrders).toHaveBeenCalledWith(guestUser, [
      {
        orderId: "c".repeat(24),
        tokenHash: createHash("sha256").update(token).digest("hex"),
      },
    ]);
  });

  it("refuses a malformed token with 400", async () => {
    getSessionActor.mockResolvedValue(guestUser);

    const res = await claim.POST(
      request("/v1/me/orders/claim", "POST", {
        body: { orders: [{ orderId: "c".repeat(24), token: "short" }] },
      }),
      route,
    );

    expect(res.status).toBe(400);
    expect(core.claimDeviceOrders).not.toHaveBeenCalled();
  });
});
