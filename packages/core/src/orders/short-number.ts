import "server-only";

import { type ClientSession, Counter, type CounterDoc } from "@namitiszunk/db";

/**
 * Next short order number for a venue and business day, starting at 1. Atomic: concurrent
 * payments never share a number. Call it only once a payment succeeded (T-033), so aborted
 * payments leave no gaps.
 */
export async function allocateShortNumber(
  venueId: CounterDoc["venueId"] | string,
  businessDate: string,
  session?: ClientSession,
): Promise<number> {
  const increment = () =>
    Counter.findOneAndUpdate(
      { venueId, businessDate },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    ).lean();
  try {
    return (await increment()).seq;
  } catch (error) {
    // Two first calls of the day may both insert; the loser retries once and increments.
    // Inside a transaction the duplicate key aborted it, so the caller's withTransaction decides.
    if (session?.inTransaction() || !isDuplicateKey(error)) throw error;
    return (await increment()).seq;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export function formatShortNumber(shortNumber: number): string {
  return `#${shortNumber}`;
}
