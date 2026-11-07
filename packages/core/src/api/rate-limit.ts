import "server-only";

import { createHash } from "node:crypto";

import { RateLimit } from "@namitiszunk/db";

export type RateLimitRule = { limit: number; windowSeconds: number };

/**
 * Counts one request in a fixed window; returns the seconds to wait when over the limit.
 * shortcut: one database write per request; the spec accepts it for the pilot, k6 decides at T-117.
 */
export async function hitRateLimit(
  bucket: string,
  rule: RateLimitRule,
  now = Date.now(),
): Promise<{ retryAfterSeconds: number } | null> {
  const windowMs = rule.windowSeconds * 1000;
  const windowEnd = (Math.floor(now / windowMs) + 1) * windowMs;
  const key = createHash("sha256")
    .update(`${bucket}|${windowEnd}`)
    .digest("hex");

  const doc = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
    { upsert: true, returnDocument: "after", projection: { count: 1 } },
  )
    // An upsert always returns the document; orFail only narrows the type.
    .orFail()
    .lean();

  if (doc.count <= rule.limit) return null;
  return { retryAfterSeconds: Math.ceil((windowEnd - now) / 1000) };
}

const lockKey = (bucket: string) =>
  createHash("sha256").update(`lock|${bucket}`).digest("hex");

/** Locks a bucket for exactly `seconds` from `now` (a PIN lockout), extending any running lock. */
export async function lockRateLimit(
  bucket: string,
  seconds: number,
  now = Date.now(),
): Promise<void> {
  await RateLimit.updateOne(
    { key: lockKey(bucket) },
    { $set: { count: 1, expiresAt: new Date(now + seconds * 1000) } },
    { upsert: true },
  );
}

/** Seconds left on a lock set by `lockRateLimit`, or null. The TTL monitor lags, so expiry is checked here. */
export async function rateLimitLockedFor(
  bucket: string,
  now = Date.now(),
): Promise<number | null> {
  const doc = await RateLimit.findOne(
    { key: lockKey(bucket), expiresAt: { $gt: new Date(now) } },
    { expiresAt: 1 },
  ).lean();
  return doc ? Math.ceil((doc.expiresAt.getTime() - now) / 1000) : null;
}
