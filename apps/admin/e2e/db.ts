// The in-memory e2e database and a real Better Auth session for the seeded club members.
// apps never import packages/db (ARCHITECTURE §05), so each change runs as a script inside it.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const E2E_PORT = 3102;
// Same value as serve.mts.
const E2E_AUTH_SECRET = "e2e-only-admin-secret-0123456789abcdef";

/** The seeded demo document id for a key, as packages/db/src/seed.ts derives it. */
export const seedId = (key: string) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);

// Playwright loads this file as CommonJS (no import.meta); it always runs from apps/admin.
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
          join(tmpdir(), `namitiszunk-admin-e2e-${E2E_PORT}.uri`),
          "utf8",
        ),
        E2E_ARGS: JSON.stringify(args),
      },
    },
  );
  return JSON.parse(out.toString() || "null");
}

/**
 * Stores an admin session for a seeded user, as Better Auth would after a sign-in, and returns
 * the signed `nmi-admin.session_token` cookie value (better-call's HMAC-SHA256, base64).
 */
export function adminSessionCookie(userKey: "owner" | "manager"): string {
  const token = randomBytes(24).toString("base64url");
  run(
    `await db.collection("session").insertOne({
      token: args[0], userId: new mongodb.ObjectId(args[1]),
      expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), updatedAt: new Date(),
      ipAddress: "", userAgent: "", app: "admin", twoFactorVerified: false });`,
    [token, seedId(`user:${userKey}`)],
  );
  const signature = createHmac("sha256", E2E_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/** The Demo Klub's venue-wide pause time, or null. */
export function venueOrdersPausedAt(): string | null {
  const venue = run(
    `return db.collection("venues").findOne({ _id: new mongodb.ObjectId(args[0]) });`,
    [seedId("venue:demo")],
  ) as { ordersPausedAt?: { $date: string } } | null;
  return venue?.ordersPausedAt?.$date ?? null;
}

/** Switches the venue-wide pause back off between tests. */
export function resumeVenueOrders() {
  run(
    `await db.collection("venues").updateOne({ _id: new mongodb.ObjectId(args[0]) }, { $unset: { ordersPausedAt: 1 } });`,
    [seedId("venue:demo")],
  );
}
