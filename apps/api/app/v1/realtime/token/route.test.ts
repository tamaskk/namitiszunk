import type { Actor } from "@namitiszunk/core/auth";
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

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// Ably is the boundary: the mocked TokenRequest echoes the params it was built from.
vi.mock("ably", () => ({
  Rest: class {
    auth = {
      createTokenRequest: async (params: { capability: string }) => params,
    };
  },
}));
const caller = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime-caller", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  realtimeCaller: caller,
}));
process.env.ABLY_API_KEY = "test.key:secret";

const { connectDb } = await import("@namitiszunk/core/api");
const { POST } = await import("./route");
const { realtimeCallerFrom, GUEST_TOKEN_HEADER } =
  await import("@/lib/realtime-caller");

const venueId = "6a0f1c2b3d4e5f6a7b8c9d0e";
const route = { params: Promise.resolve({}) };
let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

function post(body: unknown) {
  return new Request("https://api.namitiszunk.hu/v1/realtime/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const as = (actor: Exclude<Actor, { kind: "system" }>) => ({
  ...actor,
  id: "caller",
});
// A signed-in user with no venue: may see no channel.
const outsider = as({
  kind: "user",
  userId: "6a0f1c2b3d4e5f6a7b8c9d01",
  memberships: [],
});

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-realtime-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  caller.mockReset();
});

describe("POST /v1/realtime/token", () => {
  it("answers 401 without a session or guest token", async () => {
    caller.mockResolvedValue(null);

    const response = await POST(post({}), route);

    expect(response.status).toBe(401);
  });

  it("answers 403 when the caller may see no channel", async () => {
    caller.mockResolvedValue(outsider);

    const response = await POST(post({}), route);

    expect(response.status).toBe(403);
  });

  it("answers 400 for a malformed venue id", async () => {
    caller.mockResolvedValue(outsider);

    const response = await POST(post({ venueId: "nope" }), route);

    expect(response.status).toBe(400);
  });

  it("signs a subscribe-only TokenRequest for a bartender's bars", async () => {
    const { insertedId: barId } = await db.connection
      .collection("bars")
      .insertOne({ venueId: new db.Types.ObjectId(venueId), name: "Main" });
    caller.mockResolvedValue(
      as({
        kind: "staff",
        venueId,
        memberId: "6a0f1c2b3d4e5f6a7b8c9d0f",
        role: "bartender",
      }),
    );

    const response = await POST(post({}), route);

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { capability: string };
    };
    expect(JSON.parse(data.capability)).toEqual({
      [`venue:${venueId}:bar:${barId}`]: ["subscribe"],
    });
  });
});

describe("realtimeCallerFrom", () => {
  const request = (token?: string) =>
    new Request("https://api.namitiszunk.hu/v1/realtime/token", {
      headers: token ? { [GUEST_TOKEN_HEADER]: token } : {},
    });

  it("makes a guest actor from a verified guest token", async () => {
    const resolve = realtimeCallerFrom({
      sessionActor: async () => null,
      verifyGuestToken: async (token) =>
        token === "good" ? "a".repeat(64) : null,
    });

    const good = await resolve(request("good"));
    const bad = await resolve(request("bad"));
    const none = await resolve(request());

    expect(good).toEqual({
      kind: "guest",
      id: `guest:${"a".repeat(64)}`,
      guestId: "a".repeat(64),
    });
    expect(bad).toBeNull();
    expect(none).toBeNull();
  });
});
