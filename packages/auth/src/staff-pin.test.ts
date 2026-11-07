import { VenueMember } from "@namitiszunk/db";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestActor } from "./actors";
import {
  createDeviceSession,
  deviceCookieName,
  hashPin,
  signInStaffWithPin,
  staffActorFromRequest,
  staffCookieName,
} from "./staff-pin";
import { testSecret, useTestDb } from "./test-db";

vi.mock("server-only", () => ({}));
process.env.BETTER_AUTH_SECRET = testSecret;

useTestDb();

// Start of a fixed rate-limit window, so five quick attempts share one window.
const t0 = Date.UTC(2026, 10, 7, 22, 0, 0);
const venueId = new Types.ObjectId().toString();

function manager(): Extract<RequestActor, { kind: "user" }> {
  return {
    kind: "user",
    id: "user:m",
    userId: new Types.ObjectId().toString(),
    memberships: [{ venueId, memberId: "m", role: "manager" }],
  };
}

function requestWith(cookies: Record<string, string>): Request {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
  return new Request("https://admin.namitiszunk.hu/bar", {
    headers: { cookie },
  });
}

let anna: string;

beforeEach(async () => {
  await VenueMember.deleteMany({});
  const member = await VenueMember.create({
    venueId,
    role: "bartender",
    displayName: "Anna",
    pinHash: await hashPin("1234"),
  });
  anna = member._id.toString();
});

describe("createDeviceSession", () => {
  it("refuses a bartender", () => {
    const bartender = manager();
    bartender.memberships = [{ venueId, memberId: "b", role: "bartender" }];

    const act = () => createDeviceSession(bartender, venueId, t0);

    expect(act).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("refuses a manager of another venue", () => {
    const act = () =>
      createDeviceSession(manager(), new Types.ObjectId().toString(), t0);

    expect(act).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("signInStaffWithPin", () => {
  it("signs in with the correct PIN and the staff cookie identifies the member", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;

    const result = await signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "1234" },
      t0,
    );
    const actor = await staffActorFromRequest(
      requestWith({
        [deviceCookieName]: device,
        [staffCookieName]: result.cookieValue,
      }),
      t0 + 1000,
    );

    expect(result.actor).toMatchObject({ kind: "staff", memberId: anna });
    expect(actor).toEqual({
      kind: "staff",
      id: `staff:${anna}`,
      venueId,
      memberId: anna,
      role: "bartender",
    });
  });

  it("rejects a wrong PIN with 401", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;

    const attempt = signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "9999" },
      t0,
    );

    await expect(attempt).rejects.toMatchObject({
      status: 401,
      code: "pin_invalid",
    });
  });

  it("rejects a request without a device session", async () => {
    const attempt = signInStaffWithPin(
      { deviceCookie: "forged.value", memberId: anna, pin: "1234" },
      t0,
    );

    await expect(attempt).rejects.toMatchObject({ status: 401 });
  });

  it("locks the device for 5 minutes after 5 wrong PINs in a minute, then unlocks", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const tryPin = (pin: string, at: number) =>
      signInStaffWithPin({ deviceCookie: device, memberId: anna, pin }, at);
    for (let i = 0; i < 4; i++)
      await expect(tryPin("0000", t0 + i * 1000)).rejects.toMatchObject({
        code: "pin_invalid",
      });

    const fifth = tryPin("0000", t0 + 5000);
    await expect(fifth).rejects.toMatchObject({
      status: 429,
      code: "pin_locked",
    });
    const correctWhileLocked = tryPin("1234", t0 + 5000 + 4 * 60_000);
    const correctAfterLock = tryPin("1234", t0 + 5000 + 5 * 60_000 + 1000);

    await expect(correctWhileLocked).rejects.toMatchObject({
      code: "pin_locked",
    });
    await expect(correctAfterLock).resolves.toMatchObject({
      actor: { memberId: anna },
    });
  });

  it("counts wrong PINs per device, not per member", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const other = createDeviceSession(manager(), venueId, t0).cookieValue;
    const ghost = new Types.ObjectId().toString();
    for (let i = 0; i < 4; i++)
      await signInStaffWithPin(
        { deviceCookie: device, memberId: ghost, pin: "0000" },
        t0 + i,
      ).catch(() => undefined);

    const fifth = signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "0000" },
      t0 + 10,
    );
    const otherDevice = signInStaffWithPin(
      { deviceCookie: other, memberId: anna, pin: "1234" },
      t0 + 20,
    );

    await expect(fifth).rejects.toMatchObject({ code: "pin_locked" });
    await expect(otherDevice).resolves.toBeDefined();
  });

  it("checks at most 4 of 10 parallel wrong PINs, the rest are locked out", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        signInStaffWithPin(
          { deviceCookie: device, memberId: anna, pin: "0000" },
          t0,
        ),
      ),
    );

    const codes = results.map((r) =>
      r.status === "rejected" ? (r.reason as { code: string }).code : "ok",
    );
    expect(codes.filter((c) => c === "pin_invalid")).toHaveLength(4);
    expect(codes.filter((c) => c === "pin_locked")).toHaveLength(6);
  });

  it("does not count correct PINs towards the lockout", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    for (let i = 0; i < 6; i++)
      await signInStaffWithPin(
        { deviceCookie: device, memberId: anna, pin: "1234" },
        t0 + i,
      );

    const wrong = signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "0000" },
      t0 + 10,
    );

    await expect(wrong).rejects.toMatchObject({ code: "pin_invalid" });
  });

  it("never unlocks an owner or manager with a PIN", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const boss = await VenueMember.create({
      venueId,
      role: "manager",
      displayName: "Boss",
      pinHash: await hashPin("4321"),
    });

    const attempt = signInStaffWithPin(
      { deviceCookie: device, memberId: boss._id.toString(), pin: "4321" },
      t0,
    );

    await expect(attempt).rejects.toMatchObject({ code: "pin_invalid" });
  });
});

describe("staffActorFromRequest", () => {
  it("refuses a staff cookie from another device", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const other = createDeviceSession(manager(), venueId, t0).cookieValue;
    const { cookieValue } = await signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "1234" },
      t0,
    );

    const actor = await staffActorFromRequest(
      requestWith({
        [deviceCookieName]: other,
        [staffCookieName]: cookieValue,
      }),
      t0,
    );

    expect(actor).toBeNull();
  });

  it("refuses a device cookie used as a staff cookie", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;

    const actor = await staffActorFromRequest(
      requestWith({ [deviceCookieName]: device, [staffCookieName]: device }),
      t0,
    );

    expect(actor).toBeNull();
  });

  it("refuses a member deactivated after signing in", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const { cookieValue } = await signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "1234" },
      t0,
    );
    await VenueMember.updateOne({ _id: anna }, { isActive: false });

    const actor = await staffActorFromRequest(
      requestWith({
        [deviceCookieName]: device,
        [staffCookieName]: cookieValue,
      }),
      t0,
    );

    expect(actor).toBeNull();
  });

  it("refuses an expired staff cookie", async () => {
    const device = createDeviceSession(manager(), venueId, t0).cookieValue;
    const { cookieValue, expiresAt } = await signInStaffWithPin(
      { deviceCookie: device, memberId: anna, pin: "1234" },
      t0,
    );

    const actor = await staffActorFromRequest(
      requestWith({
        [deviceCookieName]: device,
        [staffCookieName]: cookieValue,
      }),
      expiresAt.getTime(),
    );

    expect(actor).toBeNull();
  });
});
