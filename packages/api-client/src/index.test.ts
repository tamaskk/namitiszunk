import type { CreateOrderInput } from "@namitiszunk/validators";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import { ApiError, createApiClient } from "./index";

const base = "https://api.test";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sessionId = "s".repeat(22);
const client = createApiClient({
  baseUrl: base,
  getToken: () => "tok",
  getSessionId: () => sessionId,
});

const order: CreateOrderInput = {
  barId: "abcdefabcdefabcdefabcdef",
  items: [{ itemId: "0123456789abcdef01234567", quantity: 1 }],
  tip: { type: "percent", bps: 0 },
  smsRequested: false,
  acceptedTermsVersion: "2026-11",
};
const created = {
  orderId: "0123456789abcdef0123abcd",
  clientSecret: "pi_secret",
  guestToken: "guest",
};

const errorBody = (
  status: number,
  code: string,
  fields: Record<string, string> = {},
) =>
  HttpResponse.json(
    { error: { code, messageKey: `apiErrors.${code}`, fields } },
    { status, headers: { "x-request-id": "req-1" } },
  );

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("createApiClient", () => {
  it("unwraps { data } and sends the bearer token", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${base}/v1/ping`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ data: { pong: true } });
      }),
    );

    const result = await client.ping();

    expect(result).toEqual({ pong: true });
    expect(auth).toBe("Bearer tok");
  });

  it("reads the OpenAPI document bare", async () => {
    server.use(
      http.get(`${base}/v1/openapi.json`, () =>
        HttpResponse.json({ openapi: "3.1.0", paths: {} }),
      ),
    );

    const doc = await client.openApiDocument();

    expect(doc.openapi).toBe("3.1.0");
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 500])(
    "turns a %i error body into a typed ApiError",
    async (status) => {
      server.use(
        http.get(`${base}/v1/ping`, () =>
          errorBody(status, "some_code", { qty: "too_small" }),
        ),
      );

      const error = await caught(client.ping());

      expect(error).toMatchObject({
        status,
        code: "some_code",
        messageKey: "apiErrors.some_code",
        fields: { qty: "too_small" },
        requestId: "req-1",
      });
    },
  );

  it("throws invalid_response when a success body breaks the schema", async () => {
    server.use(
      http.get(`${base}/v1/ping`, () =>
        HttpResponse.json({ data: { pong: "yes" } }),
      ),
    );

    const error = await caught(client.ping());

    expect(error.code).toBe("invalid_response");
    expect(error.status).toBe(200);
  });

  it("throws invalid_response when an error body is not the T-029 shape", async () => {
    server.use(
      http.get(
        `${base}/v1/ping`,
        () => new HttpResponse("oops", { status: 404 }),
      ),
    );

    const error = await caught(client.ping());

    expect(error).toMatchObject({ status: 404, code: "invalid_response" });
  });

  it("rejects an invalid id before sending", async () => {
    const error = await caught(client.orders.get("not-an-id"));

    expect(error).toMatchObject({ status: 0, code: "invalid_input" });
  });
});

describe("orders.create", () => {
  it("retries with the same Idempotency-Key and the server makes one order", async () => {
    const keys: (string | null)[] = [];
    const sessions: (string | null)[] = [];
    const orders = new Map<string, typeof created>();
    let calls = 0;
    server.use(
      http.post(`${base}/v1/orders`, ({ request }) => {
        const key = request.headers.get("idempotency-key");
        keys.push(key);
        sessions.push(request.headers.get("x-session-id"));
        calls++;
        // The first attempt creates the order but its connection drops; the second hits a 503.
        if (!orders.has(key!)) orders.set(key!, created);
        if (calls === 1) return HttpResponse.error();
        if (calls === 2) return errorBody(503, "unavailable");
        return HttpResponse.json({ data: orders.get(key!) }, { status: 201 });
      }),
    );

    const result = await client.orders.create(order);

    expect(result).toEqual(created);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessions).toEqual([sessionId, sessionId, sessionId]);
    expect(orders.size).toBe(1);
  });

  it("gives up after 3 retries", async () => {
    let calls = 0;
    server.use(
      http.post(`${base}/v1/orders`, () => {
        calls++;
        return HttpResponse.error();
      }),
    );

    const error = await caught(client.orders.create(order));

    expect(error.code).toBe("network_error");
    expect(calls).toBe(4);
  });

  it("does not retry a 4xx", async () => {
    let calls = 0;
    server.use(
      http.post(`${base}/v1/orders`, () => {
        calls++;
        return errorBody(409, "venue_closed");
      }),
    );

    const error = await caught(client.orders.create(order));

    expect(error).toMatchObject({ status: 409, code: "venue_closed" });
    expect(calls).toBe(1);
  });

  it("uses a new key for each order", async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post(`${base}/v1/orders`, ({ request }) => {
        keys.push(request.headers.get("idempotency-key"));
        return HttpResponse.json({ data: created }, { status: 201 });
      }),
    );

    await client.orders.create(order);
    await client.orders.create(order);

    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("types follow the shared schemas", () => {
  it("binds inputs and outputs to @namitiszunk/validators", () => {
    expectTypeOf(client.orders.create)
      .parameter(0)
      .toEqualTypeOf<CreateOrderInput>();
    expectTypeOf(client.orders.create).returns.resolves.toHaveProperty(
      "orderId",
    );

    // A caller that drifts from the schema fails `pnpm typecheck` (tsc checks this file).
    const missingTerms = { ...order, acceptedTermsVersion: undefined };
    const textQuantity = {
      ...order,
      items: [{ itemId: "x", quantity: "1" }],
    };
    // @ts-expect-error acceptedTermsVersion is required by createOrderInputSchema
    void (() => client.orders.create(missingTerms));
    // @ts-expect-error quantity is a number in cartLineSchema
    void (() => client.orders.create(textQuantity));
  });
});
