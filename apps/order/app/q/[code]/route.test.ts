import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveQrScan and hitRateLimit run against a database in packages/core; this covers the route's mapping.
const resolveQrScan = vi.hoisted(() => vi.fn());
const hitRateLimit = vi.hoisted(() => vi.fn());
const clientIp = vi.hoisted(() => vi.fn());
vi.mock("@namitiszunk/core/bars", () => ({ resolveQrScan }));
vi.mock("@namitiszunk/core/api", () => ({ clientIp, hitRateLimit }));
vi.mock("@/lib/db", () => ({ ensureDb: vi.fn() }));

import { GET } from "./route";

const scan = (code: string) =>
  GET(new Request(`https://rendel.namitiszunk.hu/q/${code}`), {
    params: Promise.resolve({ code }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  hitRateLimit.mockResolvedValue(null);
  clientIp.mockReturnValue("1.2.3.4");
});

describe("GET /q/[code]", () => {
  it("sends the guest to the zone's current bar with the code as source", async () => {
    resolveQrScan.mockResolvedValue({
      slug: "pilot",
      barId: "b1",
      zoneId: "z1",
      code: "ABCD2345",
    });

    const response = await scan("ABCD2345");

    expect(resolveQrScan).toHaveBeenCalledWith("ABCD2345", { count: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://rendel.namitiszunk.hu/v/pilot?bar=b1&zone=z1&q=ABCD2345",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sends an unknown or malformed code home without a lookup for the malformed one", async () => {
    resolveQrScan.mockResolvedValue(null);

    const unknown = await scan("ZZZZZZZZ");
    const malformed = await scan("x$1");

    expect(unknown.headers.get("Location")).toBe(
      "https://rendel.namitiszunk.hu/",
    );
    expect(malformed.headers.get("Location")).toBe(
      "https://rendel.namitiszunk.hu/",
    );
    expect(malformed.headers.get("Cache-Control")).toBe("no-store");
    expect(resolveQrScan).toHaveBeenCalledTimes(1);
  });

  it("answers 429 over the rate limit without counting a scan", async () => {
    hitRateLimit.mockResolvedValue({ retryAfterSeconds: 30 });

    const response = await scan("ABCD2345");

    expect(response.status).toBe(429);
    expect(resolveQrScan).not.toHaveBeenCalled();
  });

  it("redirects a repeat scan from the same address without counting it", async () => {
    resolveQrScan.mockResolvedValue({
      slug: "pilot",
      barId: null,
      zoneId: null,
      code: "ABCD2345",
    });
    hitRateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ retryAfterSeconds: 40 });

    const response = await scan("ABCD2345");

    expect(response.status).toBe(302);
    expect(resolveQrScan).toHaveBeenCalledWith("ABCD2345", { count: false });
  });

  it("serves a guest with no client address without counting the scan", async () => {
    clientIp.mockReturnValue(null);
    resolveQrScan.mockResolvedValue({
      slug: "pilot",
      barId: null,
      zoneId: null,
      code: "ABCD2345",
    });

    const response = await scan("ABCD2345");

    expect(response.status).toBe(302);
    expect(hitRateLimit).not.toHaveBeenCalled();
    expect(resolveQrScan).toHaveBeenCalledWith("ABCD2345", { count: false });
  });
});
