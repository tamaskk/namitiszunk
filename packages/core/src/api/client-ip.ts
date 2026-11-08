/**
 * The caller's address for per-IP rate limits, or null when it cannot be known.
 * Vercel overwrites x-forwarded-for with the real client address, so it cannot be spoofed there.
 * Outside production a missing header reads as "local"; in production nobody could be told
 * apart, so callers answer 400 client_unknown on null.
 */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) return ip;
  return process.env.NODE_ENV === "production" ? null : "local";
}
