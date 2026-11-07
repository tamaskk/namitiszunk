import * as crypto from "node:crypto";

import { can } from "@namitiszunk/core/auth";
import { Order } from "@namitiszunk/db";
import { Types } from "mongoose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createGuestToken,
  guestActorFromToken,
  guestTokenMatches,
} from "./guest-token";
import { useTestDb } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof crypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

useTestDb();

const orderId = new Types.ObjectId().toString();
const otherOrderId = new Types.ObjectId().toString();
let token: string;
let tokenHash: string;
let otherToken: string;

beforeAll(async () => {
  const first = createGuestToken();
  const second = createGuestToken();
  token = first.token;
  tokenHash = first.hash;
  otherToken = second.token;
  // Only the fields this test reads; the full order shape is T-033's.
  await Order.collection.insertMany([
    {
      _id: new Types.ObjectId(orderId),
      guestTokenHash: first.hash,
      shortNumber: 1,
    },
    {
      _id: new Types.ObjectId(otherOrderId),
      guestTokenHash: second.hash,
      shortNumber: 2,
    },
  ]);
});

describe("createGuestToken", () => {
  it("makes a 128-bit url-safe token and stores only its hash", () => {
    const { token: t, hash } = createGuestToken();

    expect(Buffer.from(t, "base64url")).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(t);
    expect(createGuestToken().token).not.toBe(t);
  });

  it("compares in constant time", () => {
    const { token: t, hash } = createGuestToken();
    vi.mocked(crypto.timingSafeEqual).mockClear();

    const matches = guestTokenMatches(t, hash);

    expect(matches).toBe(true);
    expect(crypto.timingSafeEqual).toHaveBeenCalledOnce();
  });
});

describe("guestActorFromToken", () => {
  it("returns the guest of the order for the right token", async () => {
    const actor = await guestActorFromToken(orderId, token);

    expect(actor).toEqual({
      kind: "guest",
      id: `guest:${orderId}`,
      guestId: tokenHash,
    });
  });

  it("gives a guest that passes core's own-order check for this order only", async () => {
    const actor = await guestActorFromToken(orderId, token);
    const venueId = new Types.ObjectId().toString();

    const own = can(actor, "order.reject", { venueId, guestId: tokenHash });
    const other = can(actor, "order.reject", {
      venueId,
      guestId: "b".repeat(64),
    });

    expect([own, other]).toEqual([true, false]);
  });

  it.each([
    ["no token", () => [orderId, null] as const],
    ["a wrong token", () => [orderId, createGuestToken().token] as const],
    ["another order's token", () => [orderId, otherToken] as const],
    ["a malformed token", () => [orderId, "x".repeat(200)] as const],
    [
      "an unknown order",
      () => [new Types.ObjectId().toString(), token] as const,
    ],
    ["an invalid order id", () => [`{"$ne":null}`, token] as const],
  ])("answers 404 for %s", async (_, args) => {
    const [id, t] = args();

    const result = guestActorFromToken(id, t);

    await expect(result).rejects.toMatchObject({ status: 404 });
  });
});
