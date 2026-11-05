import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True only when `header` is exactly `Bearer <expected>`. Hashing both sides first gives
 * equal-length buffers, so the comparison takes the same time whatever the input length.
 */
export function bearerTokenMatches(
  header: string | null,
  expected: string | undefined,
): boolean {
  // The env schema enforces 32 characters at build time; preview builds may skip that check.
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) {
    return false;
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(header.slice("Bearer ".length)),
    digest(expected),
  );
}
