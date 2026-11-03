import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { bearerTokenMatches } = await import("./bearer-token");

const token = "t".repeat(40);

describe("bearerTokenMatches", () => {
  it("accepts the exact bearer token", () => {
    const header = `Bearer ${token}`;

    const result = bearerTokenMatches(header, token);

    expect(result).toBe(true);
  });

  it.each([
    ["a wrong token", `Bearer ${"x".repeat(40)}`],
    ["a token prefix", `Bearer ${token.slice(0, 10)}`],
    ["another scheme", `Basic ${token}`],
    ["no header", null],
  ])("rejects %s", (_case, header) => {
    const result = bearerTokenMatches(header, token);

    expect(result).toBe(false);
  });

  it("rejects a configured token shorter than 32 characters", () => {
    const short = "s".repeat(31);

    const result = bearerTokenMatches(`Bearer ${short}`, short);

    expect(result).toBe(false);
  });

  it("rejects everything when no token is configured", () => {
    const header = "Bearer ";

    const result = bearerTokenMatches(header, undefined);

    expect(result).toBe(false);
  });
});
