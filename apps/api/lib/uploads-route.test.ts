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
// The client token is signed locally (no network call), so the real SDK runs with a dummy store token.
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secret";

const { connectDb } = await import("@namitiszunk/core/api");
const { POST } = await import("@/app/v1/uploads/route");

const venueId = "a".repeat(24);
const route = { params: Promise.resolve({}) };

const member = (
  role: "manager" | "owner" | "bartender",
  forVenue = venueId,
): SessionActor => ({
  id: "u1",
  kind: "user",
  userId: "u1",
  memberships: [{ venueId: forVenue, memberId: "m1", role }],
});

// What Blob enforces: the signed payload inside `vercel_blob_client_<store>_<base64(key.payload)>`.
function tokenPayload(clientToken: string): unknown {
  const signed = Buffer.from(clientToken.split("_")[4] ?? "", "base64")
    .toString()
    .split(".")[1];
  return JSON.parse(Buffer.from(signed ?? "", "base64").toString());
}

function post(body: unknown) {
  return new Request("https://api.namitiszunk.hu/v1/uploads", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("uploads-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
});

describe("POST /v1/uploads", () => {
  it("gives a manager a token for a server-chosen path", async () => {
    getSessionActor.mockResolvedValue(member("manager"));

    const res = await POST(
      post({ venueId, kind: "product", pathname: "evil/../x.html" }),
      route,
    );

    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.pathname).toMatch(
      new RegExp(`^venues/${venueId}/[0-9a-f-]{36}$`),
    );
    expect(tokenPayload(data.clientToken)).toMatchObject({
      pathname: data.pathname,
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });

  it.each([
    ["a bartender", member("bartender")],
    ["another venue's manager", member("manager", "b".repeat(24))],
  ])("refuses %s with 403", async (_name, actor) => {
    getSessionActor.mockResolvedValue(actor);

    const res = await POST(post({ venueId, kind: "product" }), route);

    expect(res.status).toBe(403);
  });

  it("refuses an anonymous caller with 401", async () => {
    getSessionActor.mockResolvedValue(null);

    const res = await POST(post({ venueId, kind: "product" }), route);

    expect(res.status).toBe(401);
  });

  it("rejects an unknown upload kind with 400", async () => {
    getSessionActor.mockResolvedValue(member("owner"));

    const res = await POST(post({ venueId, kind: "document" }), route);

    expect(res.status).toBe(400);
  });
});
