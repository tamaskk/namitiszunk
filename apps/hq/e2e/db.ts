// The in-memory e2e database and real Better Auth sessions for HQ (T-066).
// apps never import packages/db (ARCHITECTURE §05), so each change runs as a script inside it.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { BrowserContext } from "@playwright/test";

const E2E_PORT = 3103;
// Same value as serve.mts.
const E2E_AUTH_SECRET = "e2e-only-hq-secret-0123456789abcdef";

/** The seeded demo document id for a key, as packages/db/src/seed.ts derives it. */
export const seedId = (key: string) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);

// Playwright loads this file as CommonJS (no import.meta); it always runs from apps/hq.
const dbPackage = resolve("../../packages/db");

/** Runs one script against the e2e database; `args` is EJSON, the script prints EJSON back. */
function run(body: string, args: unknown[]): unknown {
  const script = `
    import mongodb from "mongodb";
    const { MongoClient, BSON: { EJSON } } = mongodb;
    const client = await MongoClient.connect(process.env.E2E_URI);
    const db = client.db();
    const args = EJSON.parse(process.env.E2E_ARGS);
    const out = await (async () => { ${body} })();
    process.stdout.write(EJSON.stringify(out ?? null));
    await client.close();`;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: dbPackage,
      env: {
        ...process.env,
        E2E_URI: readFileSync(
          join(tmpdir(), `namitiszunk-hq-e2e-${E2E_PORT}.uri`),
          "utf8",
        ),
        E2E_ARGS: JSON.stringify(args),
      },
    },
  );
  return JSON.parse(out.toString() || "null");
}

/** A new user with an active platform admin role, as `hq:create-admin` leaves it; returns its id. */
export function createPlatformAdmin(
  options: { twoFactorEnabled?: boolean } = {},
): string {
  return run(
    `const _id = new mongodb.ObjectId();
    await db.collection("user").insertOne({ _id, email: _id.toHexString() + "@hq.test",
      name: "HQ", emailVerified: true, twoFactorEnabled: args[0],
      createdAt: new Date(), updatedAt: new Date() });
    await db.collection("platformmembers").insertOne({ userId: _id, role: "admin",
      isActive: true, createdAt: new Date(), updatedAt: new Date() });
    return _id.toHexString();`,
    [options.twoFactorEnabled ?? false],
  ) as string;
}

/**
 * Stores an HQ session as Better Auth would after the e-mail link (no TOTP checked yet, unless
 * `verified`), and returns the signed `nmi-hq.session_token` cookie value (HMAC-SHA256, base64).
 */
export function hqSessionCookie(
  userId: string,
  options: { verified?: boolean; expiresInMs?: number } = {},
): string {
  const token = randomBytes(24).toString("base64url");
  run(
    `await db.collection("session").insertOne({
      token: args[0], userId: new mongodb.ObjectId(args[1]),
      expiresAt: new Date(Date.now() + args[3]), createdAt: new Date(), updatedAt: new Date(),
      ipAddress: "", userAgent: "", app: "hq", twoFactorVerified: args[2] });`,
    [token, userId, options.verified ?? false, options.expiresInMs ?? 3600_000],
  );
  const signature = createHmac("sha256", E2E_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/** The newest session of a user, to check the lifetime Better Auth gave it. */
export function latestSession(userId: string): {
  createdAt: string;
  expiresAt: string;
} {
  const session = run(
    `return db.collection("session").findOne({ userId: new mongodb.ObjectId(args[0]) },
      { sort: { createdAt: -1 } });`,
    [userId],
  ) as { createdAt: { $date: string }; expiresAt: { $date: string } };
  return {
    createdAt: session.createdAt.$date,
    expiresAt: session.expiresAt.$date,
  };
}

export async function signIn(context: BrowserContext, cookie: string) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "nmi-hq.session_token",
      value: cookie,
      url: `http://localhost:${E2E_PORT}`,
      httpOnly: true,
    },
  ]);
}

/** The authenticator app's current code for a base32 secret (RFC 6238, SHA-1, 30 s, 6 digits). */
export function totp(base32Secret: string, at = Date.now()): string {
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
