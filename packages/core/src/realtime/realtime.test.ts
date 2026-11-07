import { Bar, connectDb, Order } from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Actor } from "../auth/permissions";
import {
  barChannel,
  createTokenRequest,
  orderChannel,
  shouldApply,
  vipChannel,
} from "./index";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));
// Ably is the boundary: the mocked TokenRequest echoes the params it was built from.
vi.mock("ably", () => ({
  Rest: class {
    auth = {
      createTokenRequest: async (params: { capability: string }) => params,
    };
  },
}));
process.env.ABLY_API_KEY = "test.key:secret";

const venueId = new Types.ObjectId().toHexString();
const otherVenueId = new Types.ObjectId().toHexString();
const guestTokenHash = "b".repeat(64);
let barIds: string[] = [];
let orderId = "";

const staff = (role: "bartender" | "vip_host" | "manager"): Actor => ({
  kind: "staff",
  venueId,
  memberId: new Types.ObjectId().toHexString(),
  role,
});

async function capabilityOf(
  actor: Actor,
  input?: { venueId?: string },
): Promise<Record<string, string[]>> {
  const request = await createTokenRequest(actor, input);
  return JSON.parse(request.capability) as Record<string, string[]>;
}

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_realtime_test"));
  const bars = await Bar.create([
    { venueId, name: "Main" },
    { venueId, name: "Terrace" },
    { venueId: otherVenueId, name: "Elsewhere" },
  ]);
  barIds = bars.slice(0, 2).map((bar) => String(bar._id));
  const order = await Order.create({
    venueId,
    barId: barIds[0],
    shortNumber: 1,
    businessDate: "2026-11-07",
    items: [
      {
        itemId: new Types.ObjectId(),
        name: "Gin tonic",
        unitPriceHuf: 2490,
        quantity: 1,
        lineTotalHuf: 2490,
      },
    ],
    subtotalHuf: 2490,
    totalHuf: 2490,
    pickupCode: "K7Q",
    guestTokenHash,
    acceptedTermsVersion: "2026-11-01",
  });
  orderId = String(order._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

describe("channel names", () => {
  it("names the bar, VIP and order channels", () => {
    expect(barChannel("v1", "b1")).toBe("venue:v1:bar:b1");
    expect(vipChannel("v1")).toBe("venue:v1:vip");
    expect(orderChannel("o1")).toBe("order:o1");
  });
});

describe("createTokenRequest", () => {
  it("gives a bartender only their own venue's bar channels", async () => {
    const capability = await capabilityOf(staff("bartender"), {
      venueId: otherVenueId,
    });

    expect(capability).toEqual(
      Object.fromEntries(
        barIds.map((barId) => [barChannel(venueId, barId), ["subscribe"]]),
      ),
    );
  });

  it("gives a VIP host only the venue VIP channel", async () => {
    const capability = await capabilityOf(staff("vip_host"));

    expect(capability).toEqual({ [vipChannel(venueId)]: ["subscribe"] });
  });

  it("gives a guest only the channel of the order their token proves", async () => {
    const capability = await capabilityOf({
      kind: "guest",
      guestId: guestTokenHash,
    });

    expect(capability).toEqual({ [orderChannel(orderId)]: ["subscribe"] });
  });

  it("gives a signed-in owner the requested venue only when they are a member", async () => {
    const owner: Actor = {
      kind: "user",
      userId: new Types.ObjectId().toHexString(),
      memberships: [
        {
          venueId,
          memberId: new Types.ObjectId().toHexString(),
          role: "owner",
        },
      ],
    };

    const own = await capabilityOf(owner, { venueId });
    const other = await createTokenRequest(owner, {
      venueId: otherVenueId,
    }).catch((error: unknown) => error);

    expect(Object.keys(own)).toHaveLength(3);
    expect(other).toMatchObject({ status: 403 });
  });

  it("refuses a guest token without an order, the system and an unknown venue", async () => {
    const actors: Actor[] = [
      { kind: "guest", guestId: "c".repeat(64) },
      { kind: "system", source: "stripe" },
      {
        kind: "user",
        userId: new Types.ObjectId().toHexString(),
        memberships: [],
      },
    ];

    const results = await Promise.allSettled(
      actors.map((actor) => createTokenRequest(actor, { venueId })),
    );

    for (const result of results) {
      expect(result).toMatchObject({
        status: "rejected",
        reason: { status: 403 },
      });
    }
  });

  it("never grants publish or any capability beyond subscribe", async () => {
    const actors: Actor[] = [
      staff("bartender"),
      staff("vip_host"),
      staff("manager"),
      { kind: "guest", guestId: guestTokenHash },
    ];

    const capabilities = await Promise.all(actors.map((a) => capabilityOf(a)));

    for (const capability of capabilities) {
      for (const operations of Object.values(capability)) {
        expect(operations).toEqual(["subscribe"]);
      }
    }
  });
});

describe("shouldApply", () => {
  it("drops a message older than the shown version and applies newer or equal ones", () => {
    expect(shouldApply(undefined, { version: 5 })).toBe(true);
    expect(shouldApply(5, { version: 4 })).toBe(false);
    expect(shouldApply(5, { version: 5 })).toBe(true);
    expect(shouldApply(5, { version: 6 })).toBe(true);
  });
});
