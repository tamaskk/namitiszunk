import "server-only";

import { IdempotencyKey } from "@namitiszunk/db";

const TTL_MS = 24 * 60 * 60 * 1000;

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
 * the unique index decides between two that arrive at the same time.
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
      expiresAt: new Date(now + TTL_MS),
    });
    return { kind: "new" };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  const existing = await IdempotencyKey.findOne({ key }).lean();
  // Released or expired between the insert and the read: the client may simply retry.
  if (!existing) return { kind: "in_progress" };
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
): Promise<void> {
  await IdempotencyKey.updateOne({ key }, { $set: { response } });
}

/** Frees the key after a failed request, so the client can retry with it. */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await IdempotencyKey.deleteOne({
    key,
    "response.status": { $exists: false },
  });
}
