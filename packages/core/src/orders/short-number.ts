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
  const counter = await Counter.findOneAndUpdate(
    { venueId, businessDate },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  return counter.seq;
}

export function formatShortNumber(shortNumber: number): string {
  return `#${shortNumber}`;
}
