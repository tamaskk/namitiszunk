import { beforeEach, describe, expect, it, vi } from "vitest";

const pingDb = vi.hoisted(() => vi.fn());
vi.mock("@namitiszunk/core/api", () => ({ pingDb }));
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

import { GET } from "./route";

describe("GET /health", () => {
  beforeEach(() => {
    vi.stubEnv("MONGODB_URI", "mongodb://db.test/x");
    vi.stubEnv("HEALTH_FORCE_FAIL", "");
    pingDb.mockReset();
  });

  it("answers 200 when the database answers the ping", async () => {
    pingDb.mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when the database does not answer", async () => {
    pingDb.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "down" });
  });

  it("answers 503 without a database URI", async () => {
    vi.stubEnv("MONGODB_URI", "");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(pingDb).not.toHaveBeenCalled();
  });
});
