import { afterEach, describe, expect, it, vi } from "vitest";

import { clientIp } from "./client-ip";

const request = (forwardedFor?: string) =>
  new Request("https://namitiszunk.hu/", {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for address", () => {
    expect(clientIp(request("203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
  });

  it("reads a missing address as local outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(clientIp(request())).toBe("local");
  });

  it("returns null for a missing address in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(clientIp(request())).toBeNull();
    expect(clientIp(request(" "))).toBeNull();
  });
});
