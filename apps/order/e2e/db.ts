// The in-memory e2e database, for tests that play the Admin (sold out, paused bar) or a busy client.
// apps never import packages/db (ARCHITECTURE §05), so each change runs as a script inside it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const E2E_PORT = 3101;

export const e2eUriFile = (port: string | number) =>
  join(tmpdir(), `namitiszunk-order-e2e-${port}.uri`);

// Playwright loads this file as CommonJS (no import.meta); it always runs from apps/order.
const dbPackage = resolve("../../packages/db");

/** Runs one MongoDB update; `filter` and `update` are EJSON, so ids and dates survive the trip. */
function update(
  collection: string,
  filter: object,
  change: object,
  upsert = false,
) {
  const script = `
    import mongodb from "mongodb";
    const { MongoClient, BSON: { EJSON } } = mongodb;
    const client = await MongoClient.connect(process.env.E2E_URI);
    const [filter, change] = EJSON.parse(process.env.E2E_ARGS);
    await client.db().collection(process.env.E2E_COLLECTION).updateOne(filter, change, { upsert: ${upsert} });
    await client.close();`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: dbPackage,
    env: {
      ...process.env,
      E2E_URI: readFileSync(e2eUriFile(E2E_PORT), "utf8"),
      E2E_COLLECTION: collection,
      E2E_ARGS: JSON.stringify([filter, change]),
    },
  });
}

const oid = (id: string) => ({ $oid: id });

/** Sets an item's isAvailable, as the Admin's sold-out switch would (T-054). */
export function setItemAvailable(itemId: string, available: boolean) {
  update("items", { _id: oid(itemId) }, { $set: { isAvailable: available } });
}

/** Pauses a bar (ten minutes unless told otherwise), or resumes it with false. */
export function setBarPaused(barId: string, paused: boolean, forMs = 600_000) {
  update(
    "bars",
    { _id: oid(barId) },
    paused
      ? {
          $set: {
            pausedUntil: {
              $date: new Date(Date.now() + forMs).toISOString(),
            },
          },
        }
      : { $unset: { pausedUntil: 1 } },
  );
}

/** Fills a rate-limit bucket for this window and the next, as packages/core hitRateLimit keys it. */
export function exhaustRateLimit(bucket: string) {
  const windowMs = 60_000;
  const end = (Math.floor(Date.now() / windowMs) + 1) * windowMs;
  for (const windowEnd of [end, end + windowMs]) {
    const key = createHash("sha256")
      .update(`${bucket}|${windowEnd}`)
      .digest("hex");
    update(
      "ratelimits",
      { key },
      {
        $set: {
          count: 1_000_000,
          expiresAt: { $date: new Date(windowEnd).toISOString() },
        },
      },
      true,
    );
  }
}

/** Inserts (or replaces the fields of) one document, given in EJSON ({ $oid }, { $date }). */
export function upsertDocument(
  collection: string,
  doc: { _id: object } & Record<string, unknown>,
) {
  update(collection, { _id: doc._id }, { $set: doc }, true);
}
