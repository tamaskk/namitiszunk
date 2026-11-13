import { createHmac } from "node:crypto";

import { PlatformMember, User, VenueMember } from "@namitiszunk/db";
import { Types } from "mongoose";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";

import { userActorFromHeaders } from "./actors";
import {
  cookieDomainFor,
  createAuth,
  type Auth,
  type AuthApp,
} from "./better-auth";
import { testSecret, useTestDb } from "./test-db";

vi.mock("server-only", () => ({}));
vi.mock("@namitiszunk/emails", () => ({ sendEmail: vi.fn() }));
process.env.BETTER_AUTH_SECRET = testSecret;
process.env.BETTER_AUTH_URL = "http://localhost:3002";

const db = useTestDb();
const auths = {} as Record<AuthApp, Auth>;

beforeAll(() => {
  for (const app of ["order", "admin", "hq"] as const)
    auths[app] = createAuth(app, db().connection.db!);
});

async function signedInUser(
  app: AuthApp,
  user: { twoFactorEnabled?: boolean } = {},
) {
  const ctx = await auths[app].$context;
  const created = await ctx.internalAdapter.createUser(
    {
      email: `${new Types.ObjectId().toString()}@example.com`,
      name: "Test User",
      emailVerified: true,
      ...user,
    },
    { method: "magic-link" },
  );
  const session = await ctx.internalAdapter.createSession(created.id, false);
  return { userId: created.id, token: session.token };
}

// The same signed value Better Auth sets (better-call signCookieValue).
function signed(token: string): string {
  const signature = createHmac("sha256", testSecret)
    .update(token)
    .digest("base64");
  return `${token}.${signature}`;
}

function cookieHeaders(app: AuthApp, token: string): Headers {
  return new Headers({
    cookie: `nmi-${app}.session_token=${encodeURIComponent(signed(token))}`,
  });
}

async function markTwoFactorVerified(app: AuthApp, token: string) {
  const ctx = await auths[app].$context;
  await ctx.internalAdapter.updateSession(token, { twoFactorVerified: true });
}

/** Rate limits use fixed clock windows: start a counting test right after a 15-minute boundary so it never spans two windows. */
function freezeAtWindowStart() {
  const quarter = 15 * 60 * 1000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Math.ceil(Date.now() / quarter) * quarter + 1000);
}

describe("last sign-in", () => {
  it("stamps the user's lastSignInAt on every new session (T-028 retention)", async () => {
    const { userId } = await signedInUser("order");

    const user = await User.collection.findOne({
      _id: new Types.ObjectId(userId),
    });

    expect(user?.lastSignInAt).toBeInstanceOf(Date);
  });
});

describe("session separation", () => {
  it("accepts an admin session in admin", async () => {
    const { userId, token } = await signedInUser("admin");

    const actor = await userActorFromHeaders(
      auths.admin,
      "admin",
      cookieHeaders("admin", token),
    );

    expect(actor).toMatchObject({ kind: "user", userId });
  });

  it("does not accept an admin session in HQ, under either cookie name", async () => {
    const { token } = await signedInUser("admin", { twoFactorEnabled: true });
    await markTwoFactorVerified("admin", token);

    const adminCookie = await userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("admin", token),
    );
    const replayedAsHq = await userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", token),
    );

    expect(adminCookie).toBeNull();
    expect(replayedAsHq).toBeNull();
  });

  it("does not accept an HQ session in admin", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });
    await markTwoFactorVerified("hq", token);

    const actor = await userActorFromHeaders(
      auths.admin,
      "admin",
      cookieHeaders("admin", token),
    );

    expect(actor).toBeNull();
  });
});

describe("HQ two-factor guard", () => {
  it("requires 2FA setup before anything else", async () => {
    const { token } = await signedInUser("hq");

    const result = userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", token),
    );

    await expect(result).rejects.toMatchObject({
      status: 403,
      code: "two_factor_setup_required",
    });
  });

  it("requires a TOTP check in this session when 2FA is set up", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });

    const result = userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", token),
    );

    await expect(result).rejects.toMatchObject({
      code: "two_factor_required",
    });
  });

  it("lets a verified platform member in with the role from the database", async () => {
    const { userId, token } = await signedInUser("hq", {
      twoFactorEnabled: true,
    });
    await markTwoFactorVerified("hq", token);
    await PlatformMember.create({ userId, role: "support" });

    const actor = await userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", token),
    );

    expect(actor).toEqual({
      kind: "user",
      id: `user:${userId}`,
      userId,
      memberships: [],
      platformRole: "support",
      twoFactorVerified: true,
    });
  });

  it("does not let a client mark its own session as 2FA-verified", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });

    const update = await auths.hq.api
      .updateSession({
        headers: cookieHeaders("hq", token),
        body: { twoFactorVerified: true } as Record<string, unknown>,
      })
      .catch((error: unknown) => error);
    const result = userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", token),
    );

    expect(update).toBeDefined();
    await expect(result).rejects.toMatchObject({
      code: "two_factor_required",
    });
  });
});

describe("actor builders", () => {
  it("never produce a system or platform actor from request data", async () => {
    const { userId, token } = await signedInUser("admin");
    await PlatformMember.create({ userId, role: "admin" });
    const headers = cookieHeaders("admin", token);
    headers.set("x-actor-kind", "system");
    headers.set("x-platform-role", "admin");

    const actor = await userActorFromHeaders(auths.admin, "admin", headers);

    expect(actor?.kind).toBe("user");
    expect(actor).not.toHaveProperty("platformRole");
    expect(actor).not.toHaveProperty("confirmedWrite");
  });

  it("loads only active venue memberships in admin", async () => {
    const { userId, token } = await signedInUser("admin");
    const venueId = new Types.ObjectId();
    await VenueMember.create([
      { venueId, userId, role: "owner", displayName: "Owner" },
      {
        venueId: new Types.ObjectId(),
        userId,
        role: "manager",
        displayName: "Old",
        isActive: false,
      },
    ]);

    const actor = await userActorFromHeaders(
      auths.admin,
      "admin",
      cookieHeaders("admin", token),
    );

    expect(actor?.memberships).toEqual([
      expect.objectContaining({ venueId: venueId.toString(), role: "owner" }),
    ]);
  });

  it("gives a guest in the order app no venue memberships", async () => {
    const { userId, token } = await signedInUser("order");
    await VenueMember.create({
      venueId: new Types.ObjectId(),
      userId,
      role: "owner",
      displayName: "Guest Owner",
    });

    const actor = await userActorFromHeaders(
      auths.order,
      "order",
      cookieHeaders("order", token),
    );

    expect(actor?.memberships).toEqual([]);
  });

  it("returns null without a session", async () => {
    const actor = await userActorFromHeaders(
      auths.admin,
      "admin",
      new Headers(),
    );

    expect(actor).toBeNull();
  });
});

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), so the test needs no extra dependency.
function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

function sessionTokenFrom(headers: Headers, app: AuthApp): string {
  const cookie = headers
    .getSetCookie()
    .find((c) => c.startsWith(`nmi-${app}.session_token=`));
  const value = decodeURIComponent(cookie!.split(";")[0]!.split("=")[1]!);
  return value.split(".")[0]!;
}

async function enableTotp(headers: Headers): Promise<string> {
  const result = await auths.hq.api.enableTwoFactor({ headers, body: {} });
  if (!("totpURI" in result)) throw new Error("expected a TOTP setup");
  return new URL(result.totpURI).searchParams.get("secret")!;
}

describe("HQ two-factor flow", () => {
  it("lets an HQ user set up TOTP, then enter with the rotated session", async () => {
    const { userId, token } = await signedInUser("hq");
    await PlatformMember.create({ userId, role: "finance" });
    const headers = cookieHeaders("hq", token);
    const secret = await enableTotp(headers);

    const verified = await auths.hq.api.verifyTOTP({
      headers,
      body: { code: totp(secret) },
      returnHeaders: true,
    });
    const actor = await userActorFromHeaders(
      auths.hq,
      "hq",
      cookieHeaders("hq", sessionTokenFrom(verified.headers, "hq")),
    );

    expect(actor).toMatchObject({ userId, platformRole: "finance" });
  });

  it("does not let a session that skipped TOTP replace or remove the factor", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });
    const headers = cookieHeaders("hq", token);

    const results = await Promise.allSettled([
      auths.hq.api.enableTwoFactor({ headers, body: {} }),
      auths.hq.api.disableTwoFactor({ headers, body: {} }),
      auths.hq.api.getTOTPURI({ headers, body: {} }),
    ]);

    expect(results).toEqual(
      Array(3).fill(
        expect.objectContaining({
          status: "rejected",
          reason: expect.objectContaining({ statusCode: 403 }),
        }),
      ),
    );
  });

  it("verifies a later session only with a correct TOTP", async () => {
    const first = await signedInUser("hq");
    const firstHeaders = cookieHeaders("hq", first.token);
    const secret = await enableTotp(firstHeaders);
    await auths.hq.api.verifyTOTP({
      headers: firstHeaders,
      body: { code: totp(secret) },
    });
    const ctx = await auths.hq.$context;
    const second = await ctx.internalAdapter.createSession(first.userId, false);
    const headers = cookieHeaders("hq", second.token);
    const wrongCode = totp(secret) === "000000" ? "111111" : "000000";

    const wrong = auths.hq.api.verifyTOTP({
      headers,
      body: { code: wrongCode },
    });
    await expect(wrong).rejects.toMatchObject({ statusCode: 401 });
    const beforeCorrect = userActorFromHeaders(auths.hq, "hq", headers);
    await expect(beforeCorrect).rejects.toMatchObject({
      code: "two_factor_required",
    });
    await auths.hq.api.verifyTOTP({ headers, body: { code: totp(secret) } });
    const actor = await userActorFromHeaders(auths.hq, "hq", headers);

    expect(actor).toMatchObject({ userId: first.userId });
  });
});

describe("API sessions (wave 2)", () => {
  it("accepts a signed order-app Bearer token without cookies, and only in the order app", async () => {
    const { userId, token } = await signedInUser("order");
    const headers = new Headers({ authorization: `Bearer ${signed(token)}` });
    const unsigned = new Headers({ authorization: `Bearer ${token}` });

    const order = await userActorFromHeaders(auths.order, "order", headers);
    const admin = await userActorFromHeaders(auths.admin, "admin", headers);
    const raw = await userActorFromHeaders(auths.order, "order", unsigned);

    expect(order).toMatchObject({ kind: "user", userId });
    expect(admin).toBeNull();
    expect(raw).toBeNull();
  });

  it("refuses a verified HQ session sent as Bearer to the order app", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });
    await markTwoFactorVerified("hq", token);

    const response = await auths.order.handler(
      new Request("http://localhost:3002/api/auth/update-user", {
        method: "POST",
        headers: {
          authorization: `Bearer ${signed(token)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Taken over" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("does not serve the session list, which carries every session token", async () => {
    const { token } = await signedInUser("order");

    const response = await auths.order.handler(
      new Request("http://localhost:3002/api/auth/list-sessions", {
        headers: cookieHeaders("order", token),
      }),
    );

    expect(response.status).toBe(404);
  });

  it("lets a session that skipped TOTP do nothing but finish the check", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });
    const headers = cookieHeaders("hq", token);

    const results = await Promise.allSettled([
      auths.hq.api.getTOTPURI({ headers, body: {} }),
      auths.hq.api.revokeSessions({ headers }),
      auths.hq.api.updateUser({ headers, body: { name: "x" } }),
      auths.hq.api.linkSocialAccount({
        headers,
        body: { provider: "google" },
      }),
    ]);

    expect(results).toEqual(
      Array(4).fill(
        expect.objectContaining({
          status: "rejected",
          reason: expect.objectContaining({ statusCode: 403 }),
        }),
      ),
    );
  });

  it("locks TOTP checks for a user after 5 attempts, whatever the IP", async () => {
    const { token } = await signedInUser("hq", { twoFactorEnabled: true });
    freezeAtWindowStart();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const attempt = (i: number) =>
      auths.hq.api
        .verifyTOTP({
          headers: new Headers({
            ...Object.fromEntries(cookieHeaders("hq", token)),
            "x-forwarded-for": `198.51.100.${i}`,
          }),
          body: { code: "000000" },
        })
        .then(
          () => 200,
          (e: { statusCode: number }) => e.statusCode,
        );

    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push(await attempt(i));

    expect(codes.slice(0, 5)).not.toContain(429);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it("sends at most 5 e-mail links per address in 15 minutes, whatever the IP", async () => {
    freezeAtWindowStart();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const send = (i: number) =>
      auths.order.api
        .signInMagicLink({
          headers: new Headers({ "x-forwarded-for": `203.0.113.${i}` }),
          body: { email: "Flood@Example.com" },
        })
        .then(
          () => 200,
          (e: { statusCode: number }) => e.statusCode,
        );

    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push(await send(i));

    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("shares cookies with the parent domain in production only", () => {
    const domains = [
      "https://rendel.namitiszunk.hu",
      "https://namitiszunk.hu",
      "http://localhost:3001",
      "https://namitiszunk-order-x.vercel.app",
      "https://namitiszunk.hu.evil.example",
      undefined,
    ].map(cookieDomainFor);

    expect(domains).toEqual([
      ".namitiszunk.hu",
      ".namitiszunk.hu",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
