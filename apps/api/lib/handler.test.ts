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
import { z } from "zod";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));
const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

const { connectDb } = await import("@namitiszunk/core/api");
const { ConflictError, NotFoundError } =
  await import("@namitiszunk/core/errors");
const { Forbidden } = await import("@namitiszunk/core/auth");
const { handler } = await import("./handler");
const ping = await import("@/app/v1/ping/route");
const openapi = await import("@/app/v1/openapi.json/route");

let replSet: MongoMemoryReplSet;
let db: Awaited<ReturnType<typeof connectDb>>;
const route = { params: Promise.resolve({}) };
const url = "https://api.namitiszunk.hu/v1/test";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("api-test");
  db = await connectDb(process.env.MONGODB_URI);
});

afterAll(async () => {
  await db.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await db.connection.dropDatabase();
  await Promise.all(
    Object.values(db.connection.models).map((model) => model.syncIndexes()),
  );
  captureException.mockClear();
  vi.useRealTimers();
});

describe("handler order", () => {
  const calls: string[] = [];
  const endpoint = handler(
    {
      rateLimit: { limit: 1, windowSeconds: 60 },
      auth: async (req) => {
        calls.push("auth");
        return req.headers.get("authorization") ? { id: "u1" } : null;
      },
      input: z.object({ qty: z.number().int().positive() }),
      permission: () => {
        calls.push("permission");
      },
    },
    async ({ input }) => {
      calls.push("fn");
      return input;
    },
  );
  const signedIn = { authorization: "Bearer x" };

  beforeEach(() => {
    calls.length = 0;
  });

  it("checks auth before validation: 401 for a signed-out invalid request", async () => {
    const req = post({ qty: "x" });

    const res = await endpoint(req, route);

    expect(res.status).toBe(401);
    expect(calls).toEqual(["auth"]);
  });

  it("validates before the permission check: 400 with field codes", async () => {
    const req = post({ qty: -1 }, signedIn);

    const res = await endpoint(req, route);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "validation_failed",
        messageKey: "apiErrors.validation_failed",
        fields: { qty: "too_small" },
      },
    });
    expect(calls).toEqual(["auth"]);
  });

  it("runs auth, permission and the logic in order and answers { data }", async () => {
    const req = post({ qty: 2 }, signedIn);

    const res = await endpoint(req, route);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { qty: 2 } });
    expect(calls).toEqual(["auth", "permission", "fn"]);
  });

  it("rate limits before authentication", async () => {
    await endpoint(post({ qty: 1 }, signedIn), route);
    calls.length = 0;

    const res = await endpoint(post({ qty: 1 }, signedIn), route);

    expect(res.status).toBe(429);
    expect(calls).toEqual([]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const req = new Request(url, {
      method: "POST",
      body: "{",
      headers: signedIn,
    });

    const res = await endpoint(req, route);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });
});

const open = { auth: "public", permission: "none" } as const;

describe("errors", () => {
  it.each([
    [new Forbidden("order.start"), 403, "forbidden"],
    [new NotFoundError(), 404, "not_found"],
    [new ConflictError(), 409, "conflict"],
  ])("maps %o to its status", async (error, status, code) => {
    const endpoint = handler(open, async () => {
      throw error;
    });

    const res = await endpoint(new Request(url), route);

    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("answers 500 without details and reports the error to Sentry once", async () => {
    const endpoint = handler(open, async () => {
      throw new Error("database password is hunter2");
    });

    const res = await endpoint(new Request(url), route);

    const requestId = res.headers.get("x-request-id");
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { requestId },
    });
  });

  it("sets x-request-id on success and error responses", async () => {
    const ok = handler(open, async () => "ok");
    const denied = handler(
      { auth: async () => null, permission: "none" },
      async () => "ok",
    );

    const responses = await Promise.all([
      ok(new Request(url), route),
      denied(new Request(url), route),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 401]);
    for (const res of responses) {
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("request body", () => {
  it("gives the handler the raw body, the parsed input and a readable request", async () => {
    const endpoint = handler(
      { ...open, input: z.object({ qty: z.number() }) },
      async ({ request, bodyText, input }) => ({
        fromRequest: await request.json(),
        bodyText,
        input,
      }),
    );

    const res = await endpoint(post({ qty: 3 }), route);

    expect(await res.json()).toEqual({
      data: {
        fromRequest: { qty: 3 },
        bodyText: '{"qty":3}',
        input: { qty: 3 },
      },
    });
  });
});

describe("rate limit", () => {
  it("answers 429 with Retry-After until the window ends, per client IP", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T22:00:15Z"));
    const endpoint = handler(
      { ...open, rateLimit: { limit: 2, windowSeconds: 60 } },
      async () => "ok",
    );
    const from = (ip: string) =>
      new Request(url, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await endpoint(from("1.2.3.4"), route)).status);
    }
    const limited = await endpoint(from("1.2.3.4"), route);
    const otherClient = await endpoint(from("5.6.7.8"), route);
    vi.setSystemTime(new Date("2026-11-07T22:01:00Z"));
    const nextWindow = await endpoint(from("1.2.3.4"), route);

    expect(statuses).toEqual([200, 200, 429]);
    expect(limited.headers.get("retry-after")).toBe("45");
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect(otherClient.status).toBe(200);
    expect(nextWindow.status).toBe(200);
  });
});

describe("idempotency", () => {
  let created = 0;
  let failStore = false;
  const secrets = new Map<number, string>();
  // Like order creation: the replay keeps the order id only and re-issues the secret.
  const createOrder = handler(
    {
      ...open,
      input: z.object({ qty: z.number() }),
      idempotent: {
        toReplay: (body) => {
          if (failStore) throw new Error("store failed");
          return { order: (body as { data: { order: number } }).data.order };
        },
        fromReplay: async (stored) => {
          const { order } = stored as { order: number };
          return { data: { order, secret: secrets.get(order) } };
        },
      },
    },
    async ({ input }) => {
      created += 1;
      if (input.qty < 0) throw new Error("boom");
      secrets.set(created, `secret-${created}`);
      return Response.json(
        { data: { order: created, secret: `secret-${created}` } },
        { status: 201 },
      );
    },
  );
  const session = (id: string) => ({ "x-session-id": id.padEnd(22, "x") });
  const caller = session("callerA");

  beforeEach(() => {
    created = 0;
    failStore = false;
  });

  it("creates one order for the same Idempotency-Key sent twice", async () => {
    const key = { "idempotency-key": "7d0c9a5e-key", ...caller };

    const first = await createOrder(post({ qty: 1 }, key), route);
    const second = await createOrder(post({ qty: 1 }, key), route);

    expect(created).toBe(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
  });

  it("stores no secret for the replay", async () => {
    const key = { "idempotency-key": "no-secret", ...caller };

    await createOrder(post({ qty: 1 }, key), route);

    const stored = await db.connection
      .collection("idempotencyKeys")
      .findOne({});
    expect(stored?.response?.body).toBe('{"order":1}');
  });

  it("lets only one of two concurrent requests with the same key run", async () => {
    const key = { "idempotency-key": "concurrent", ...caller };

    const responses = await Promise.all([
      createOrder(post({ qty: 1 }, key), route),
      createOrder(post({ qty: 1 }, key), route),
    ]);

    // The second one gets 409 while the first runs, or the replay once it finished.
    expect(created).toBe(1);
    for (const res of responses) expect([201, 409]).toContain(res.status);
  });

  it("rejects the same key with another body", async () => {
    const key = { "idempotency-key": "reused", ...caller };
    await createOrder(post({ qty: 1 }, key), route);

    const res = await createOrder(post({ qty: 2 }, key), route);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("idempotency_key_reused");
    expect(created).toBe(1);
  });

  it("never replays another caller's response", async () => {
    const key = { "idempotency-key": "shared-key" };
    await createOrder(post({ qty: 1 }, { ...key, ...caller }), route);

    const other = await createOrder(
      post({ qty: 1 }, { ...key, ...session("callerB") }),
      route,
    );

    expect(other.headers.get("idempotent-replayed")).toBeNull();
    expect(await other.json()).toEqual({
      data: { order: 2, secret: "secret-2" },
    });
    expect(created).toBe(2);
  });

  it("refuses a key on a public endpoint without a session id", async () => {
    const res = await createOrder(
      post({ qty: 1 }, { "idempotency-key": "anonymous" }),
      route,
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({
      "X-Session-Id": "required",
    });
    expect(created).toBe(0);
  });

  it("answers but never runs again when storing the response fails", async () => {
    const key = { "idempotency-key": "store-fails", ...caller };
    failStore = true;

    const first = await createOrder(post({ qty: 1 }, key), route);
    const retry = await createOrder(post({ qty: 1 }, key), route);

    expect(first.status).toBe(201);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(409);
    expect(created).toBe(1);
  });

  it("frees the key after a failure so a retry runs again", async () => {
    const key = { "idempotency-key": "retry", ...caller };
    await createOrder(post({ qty: -1 }, key), route);

    const res = await createOrder(post({ qty: -1 }, key), route);

    expect(res.status).toBe(500);
    expect(created).toBe(2);
  });

  it("runs every request without a key", async () => {
    await createOrder(post({ qty: 1 }), route);

    await createOrder(post({ qty: 1 }), route);

    expect(created).toBe(2);
  });
});

describe("GET /v1/ping", () => {
  it("answers { data } and is rate limited after 60 requests a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T22:00:00Z"));
    const req = () => new Request("https://api.namitiszunk.hu/v1/ping");

    const first = await ping.GET(req(), route);
    for (let i = 0; i < 59; i++) await ping.GET(req(), route);
    const over = await ping.GET(req(), route);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { pong: true } });
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("GET /v1/openapi.json", () => {
  it("serves the OpenAPI document listing itself and /v1/ping", async () => {
    const req = new Request("https://api.namitiszunk.hu/v1/openapi.json");

    const res = await openapi.GET(req, route);

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining(["/v1/ping", "/v1/openapi.json"]),
    );
  });
});
