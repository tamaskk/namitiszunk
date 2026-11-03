import { describe, expect, it } from "vitest";

import { scrubPii, scrubSpan, sentryOptions } from "./sentry";

describe("scrubPii", () => {
  it("masks emails and phone numbers anywhere in the event", () => {
    const event = {
      message: "Receipt failed for anna.kiss@example.com",
      exception: { values: [{ value: "SMS to +36 30 123 4567 bounced" }] },
      breadcrumbs: [{ message: "guest bob@example.hu opened the cart" }],
      extra: { note: "call 0036-70-765-4321", count: 3 },
    };

    const result = scrubPii(event);

    expect(JSON.stringify(result)).not.toMatch(/@example|123 4567|765-4321/);
    expect(result.message).toBe("Receipt failed for [email]");
    expect(result.extra.count).toBe(3);
  });

  it.each([
    "06 30 123 45 67",
    "06-30-123-45-67",
    "(06 30) 123 4567",
    "0630/123-4567",
    "06301234567",
    "+36 (30) 123 4567",
    "+36/30/1234567",
    "+36+30+123+4567",
    "+44 7700 900123",
    "30 123 4567",
    "301234567",
  ])("masks the phone format %s", (phone) => {
    const event = { message: `call ${phone} now` };

    const result = scrubPii(event);

    expect(result.message).toBe("call [phone] now");
  });

  it.each([
    ["an epoch in milliseconds", "at 1706123456789"],
    ["a hex trace id", "trace d9406123456789ab4c1e0f2a3b4c5d6e"],
    ["an ISO timestamp", "Order A-0427 total 12990 Ft at 2026-11-03T21:15:00Z"],
    ["a date and time", "closed 2026-11-03 21:15:00"],
    [
      "a package path",
      "/node_modules/.pnpm/next@16.4.4_@swc+helpers@0.5.23/x.js",
    ],
  ])("leaves %s intact", (_case, text) => {
    const event = { message: text };

    const result = scrubPii(event);

    expect(result.message).toBe(text);
  });

  it("masks percent-encoded emails and phone numbers in URLs", () => {
    const event = {
      request: {
        url: "https://rendel.namitiszunk.hu/receipt?to=anna%40example.com&tel=%2B36%2030%20123%204567",
      },
    };

    const result = scrubPii(event);

    expect(result.request.url).not.toMatch(/anna|123%204567|123 4567/);
  });

  it("filters values of sensitive field names whatever their format", () => {
    const event = {
      extra: {
        phoneNumber: "30-12-34",
        pin: "4821",
        otp: "991",
        spinner: "on",
      },
    };

    const result = scrubPii(event);

    expect(result.extra).toEqual({
      phoneNumber: "[Filtered]",
      pin: "[Filtered]",
      otp: "[Filtered]",
      spinner: "on",
    });
  });

  it("drops user identity, cookies and auth headers", () => {
    const event = {
      user: { id: "u1", email: "a@b.hu", ip_address: "1.2.3.4" },
      request: {
        cookies: { session: "x" },
        headers: {
          authorization: "Bearer s3cret",
          cookie: "a=b",
          "user-agent": "ua",
        },
      },
    };

    const result = scrubPii(event);

    expect(result.user).toEqual({ id: "u1" });
    expect(result.request).toEqual({ headers: { "user-agent": "ua" } });
  });

  it("survives cycles and keeps class instances", () => {
    const at = new Date("2026-11-03T20:00:00Z");
    const extra: Record<string, unknown> = { at };
    extra.self = extra;

    const result = scrubPii({ extra });

    expect(result.extra.at).toBe(at);
    expect((result.extra as Record<string, unknown>).self).toBe("[Truncated]");
  });
});

describe("scrubSpan", () => {
  it("drops request attributes and masks the rest", () => {
    const span = {
      attributes: {
        "user.ip_address": { value: "1.2.3.4" },
        "client.address": { value: "1.2.3.4" },
        "http.request.header.x_forwarded_for": { value: "1.2.3.4" },
        "http.request.body.data": { value: '{"email":"a@b.hu"}' },
        "url.query": { value: "to=a@b.hu" },
        "sentry.status.message": { value: "failed for anna@example.com" },
        "http.route": { value: "/v1/orders" },
      },
    };

    const result = scrubSpan(span);

    expect(Object.keys(result.attributes)).toEqual([
      "sentry.status.message",
      "http.route",
    ]);
    expect(result.attributes["sentry.status.message"]).toEqual({
      value: "failed for [email]",
    });
  });
});

describe("sentryOptions", () => {
  it("turns off every SDK data collector that can carry personal data", () => {
    const input = {
      dsn: "https://key@o1.ingest.sentry.io/1",
      vercelEnv: "preview",
    };

    const { dataCollection } = sentryOptions("order", input);

    expect(dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      httpHeaders: { response: false },
    });
    expect(dataCollection.httpHeaders.request.allow).not.toContain(
      "x-forwarded-for",
    );
  });

  it("tags the app and maps the Vercel environment", () => {
    const input = {
      dsn: "https://key@o1.ingest.sentry.io/1",
      vercelEnv: "preview",
    };

    const options = sentryOptions("order", input);

    expect(options.environment).toBe("preview");
    expect(options.initialScope.tags.app).toBe("order");
    expect(options.enabled).toBe(true);
  });

  it("stays off without a DSN", () => {
    const input = { dsn: undefined };

    const options = sentryOptions("api", input);

    expect(options.enabled).toBe(false);
  });

  it("reports local runs as development", () => {
    const input = { dsn: "https://k@o1.ingest.sentry.io/1" };

    const options = sentryOptions("api", input);

    expect(options.environment).toBe("development");
  });
});
