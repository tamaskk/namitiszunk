import { beforeEach, describe, expect, it, vi } from "vitest";

// validateCart and hitRateLimit are tested against a database in packages/core; this covers the action's mapping.
const hitRateLimit = vi.hoisted(() => vi.fn());
const clientIp = vi.hoisted(() => vi.fn());
const validateCart = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => {} }));
vi.mock("@namitiszunk/core/api", () => ({ clientIp, hitRateLimit }));
vi.mock("@namitiszunk/core/cart", () => ({ validateCart }));

const { validateCartAction } = await import("./actions");
const { NotFoundError } = await import("@namitiszunk/core/errors");

const input = {
  slug: "demo",
  items: [{ itemId: "a".repeat(24), quantity: 1, unitPriceHuf: 990 }],
};
const ok = { problems: [], maxItemsPerOrder: 10, overLimit: false };

beforeEach(() => {
  hitRateLimit.mockReset().mockResolvedValue(null);
  clientIp.mockReset().mockReturnValue("203.0.113.7");
  validateCart.mockReset().mockResolvedValue(ok);
});

describe("validateCartAction", () => {
  it("validates the cart and counts the call per IP and venue", async () => {
    const result = await validateCartAction(input);

    expect(result).toEqual({ data: ok });
    expect(hitRateLimit).toHaveBeenCalledWith(
      "action validateCart|ip:203.0.113.7|venue:demo",
      { limit: 300, windowSeconds: 60 },
    );
  });

  it("refuses malformed input before touching the database", async () => {
    const result = await validateCartAction({ slug: "demo", items: [] });

    expect(result).toEqual({ error: { code: "validation_failed" } });
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it("answers rate_limited and client_unknown without validating", async () => {
    hitRateLimit.mockResolvedValueOnce({ retryAfterSeconds: 5 });
    const limited = await validateCartAction(input);
    clientIp.mockReturnValueOnce(null);
    const unknown = await validateCartAction(input);

    expect(limited).toEqual({ error: { code: "rate_limited" } });
    expect(unknown).toEqual({ error: { code: "client_unknown" } });
    expect(validateCart).not.toHaveBeenCalled();
  });

  it("maps an unknown venue to not_found", async () => {
    validateCart.mockRejectedValueOnce(new NotFoundError());

    expect(await validateCartAction(input)).toEqual({
      error: { code: "not_found" },
    });
  });
});
