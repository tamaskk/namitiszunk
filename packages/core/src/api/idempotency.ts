import "server-only";

import { IdempotencyKey } from "@namitiszunk/db";

const TTL_MS = 24 * 60 * 60 * 1000;
// A request that crashed mid-way frees its key after this lease; a finished one keeps it for TTL_MS.
const LEASE_MS = 2 * 60 * 1000;

export type StoredResponse = {
  status: number;
  contentType: string;
  body: string;
};

export type IdempotencyClaim =
  | { kind: "new" }
  | { kind: "replay"; response: StoredResponse }
  | { kind: "in_progress" }
  | { kind: "mismatch" };

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

/**
 * Reserves `key` for this request. Only the request that gets `new` runs the side effect;
 * the unique index decides between two that arrive at the same time. A key whose lease or TTL
 * ran out counts as fresh, although MongoDB's TTL monitor has not deleted it yet.
 */
export async function claimIdempotencyKey(
  key: string,
  requestHash: string,
  now = Date.now(),
): Promise<IdempotencyClaim> {
  try {
    await IdempotencyKey.create({
      key,
      requestHash,
      expiresAt: new Date(now + LEASE_MS),
    });
    return { kind: "new" };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  const existing = await IdempotencyKey.findOne({ key }).lean();
  // Released or expired between the insert and the read: the client may simply retry.
  if (!existing) return { kind: "in_progress" };
  if (existing.expiresAt.getTime() <= now) {
    // Conditional on the expiry we read, so only one of two racing requests takes the key over.
    const taken = await IdempotencyKey.updateOne(
      { key, expiresAt: existing.expiresAt },
      {
        $set: { requestHash, expiresAt: new Date(now + LEASE_MS) },
        $unset: { response: 1 },
      },
    );
    return taken.modifiedCount === 1
      ? { kind: "new" }
      : { kind: "in_progress" };
  }
  if (existing.requestHash !== requestHash) return { kind: "mismatch" };
  const { status, contentType, body } = existing.response ?? {};
  if (status == null || body == null) return { kind: "in_progress" };
  return {
    kind: "replay",
    response: { status, contentType: contentType ?? "application/json", body },
  };
}

export async function storeIdempotentResponse(
  key: string,
  response: StoredResponse,
  now = Date.now(),
): Promise<void> {
  await IdempotencyKey.updateOne(
    { key },
    { $set: { response, expiresAt: new Date(now + TTL_MS) } },
  );
}

/** Keeps a key whose request ran but whose response could not be stored: a repeat must not run again. */
export async function holdIdempotencyKey(
  key: string,
  now = Date.now(),
): Promise<void> {
  await IdempotencyKey.updateOne(
    { key },
    { $set: { expiresAt: new Date(now + TTL_MS) } },
  );
}

/** Frees the key after a failed request, so the client can retry with it. */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await IdempotencyKey.deleteOne({
    key,
    "response.status": { $exists: false },
  });
}
