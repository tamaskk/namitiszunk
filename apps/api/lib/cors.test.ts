import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../proxy";
import { isAllowedOrigin } from "./cors";

const request = (origin: string | null, method = "GET") =>
  new NextRequest("https://api.namitiszunk.hu/v1/ping", {
    method,
    headers: origin ? { origin } : {},
  });

describe("CORS", () => {
  it("rejects a foreign browser origin with 403 and no CORS headers", async () => {
    const req = request("https://evil.example");

    const res = proxy(req);

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toEqual({
      error: {
        code: "origin_forbidden",
        messageKey: "apiErrors.origin_forbidden",
        fields: {},
      },
    });
  });

  it("answers a preflight from an own domain with the CORS headers", () => {
    const req = request("https://rendel.namitiszunk.hu", "OPTIONS");

    const res = proxy(req);

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://rendel.namitiszunk.hu",
    );
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Idempotency-Key",
    );
  });

  it("passes a request without Origin through untouched", () => {
    const res = proxy(request(null));

    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows localhost only in development", () => {
    const origin = "http://localhost:3001";

    const results = [
      isAllowedOrigin(origin, "development"),
      isAllowedOrigin(origin, "production"),
      isAllowedOrigin("http://localhost:3004", "development"),
      isAllowedOrigin("https://namitiszunk.hu.evil.example", "production"),
    ];

    expect(results).toEqual([true, false, false, false]);
  });
});
