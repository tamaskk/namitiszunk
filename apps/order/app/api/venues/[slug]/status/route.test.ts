import { venueStatusResponseSchema } from "@namitiszunk/validators";
import { beforeEach, describe, expect, it, vi } from "vitest";

// getVenueStatus and hitRateLimit are tested against a database in packages/core; this covers the HTTP mapping.
const hitRateLimit = vi.hoisted(() => vi.fn());
const getVenueStatus = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
// clientIp's own rules are tested in packages/core/src/api/client-ip.test.ts.
const clientIp = vi.hoisted(() => vi.fn());
vi.mock("@namitiszunk/core/api", () => ({
  clientIp,
  hitRateLimit,
  connectDb: vi.fn(),
}));
vi.mock("@namitiszunk/core/menu", () => ({ getVenueStatus }));
process.env.MONGODB_URI = "mongodb://unused";

const { GET } = await import("./route");

const barId = "b".repeat(24);
const get = (slug: string, query = "") =>
  GET(new Request(`https://namitiszunk.hu/api/venues/${slug}/status${query}`), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  hitRateLimit.mockReset().mockResolvedValue(null);
  clientIp.mockReset().mockReturnValue("203.0.113.7");
  getVenueStatus.mockReset().mockResolvedValue({
    status: "paused",
    pausedUntil: new Date("2026-11-07T22:10:00Z"),
    estimatedWaitMinutes: 6,
    soldOutItemIds: ["c".repeat(24)],
  });
});

describe("GET /api/venues/[slug]/status", () => {
  it("answers the status in the shared response shape with a short cache", async () => {
    const response = await get("demo", `?bar=${barId}`);

    const body = (await response.json()) as { data: unknown };
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=10, stale-while-revalidate=20",
    );
    expect(venueStatusResponseSchema.parse(body.data)).toEqual({
      status: "paused",
      pausedUntil: "2026-11-07T22:10:00.000Z",
      estimatedWaitMinutes: 6,
      soldOutItemIds: ["c".repeat(24)],
    });
    expect(getVenueStatus).toHaveBeenCalledWith({ slug: "demo", barId });
  });

  it("rejects a malformed slug or bar id before touching the database", async () => {
    const badSlug = await get("Demo%20Klub");
    const badBar = await get("demo", "?bar=not-an-id");

    expect(badSlug.status).toBe(400);
    expect(badBar.status).toBe(400);
    expect(await badBar.json()).toMatchObject({
      error: { code: "validation_failed", fields: { bar: expect.any(String) } },
    });
    expect(getVenueStatus).not.toHaveBeenCalled();
  });

  it("limits requests per client address and venue", async () => {
    hitRateLimit.mockResolvedValue({ retryAfterSeconds: 12 });

    const response = await get("demo");

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(hitRateLimit.mock.calls[0]?.[0]).toContain(
      "ip:203.0.113.7|venue:demo",
    );
    expect(getVenueStatus).not.toHaveBeenCalled();
  });

  it("refuses a request whose client address is unknown", async () => {
    clientIp.mockReturnValue(null);

    const response = await get("demo");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "client_unknown" },
    });
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown venue", async () => {
    getVenueStatus.mockResolvedValue(null);

    const response = await get("nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "not_found", messageKey: "apiErrors.not_found" },
    });
  });
});
