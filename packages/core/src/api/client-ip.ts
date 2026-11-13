import { isIP } from "node:net";

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

/**
 * The promo limits' key for an address (T-060). One IPv6 host is normally given a whole /64, so a
 * per-address limit would let it rotate addresses freely: IPv6 keys on its /64 prefix. IPv4, also IPv4-mapped IPv6, stays the full address. Never
 * throws: every value that is not an address (a port, brackets, garbage) shares one key, so rotating
 * garbage never opens a fresh bucket.
 */
export function ipPrefixKey(raw: string): string {
  const ip = raw.split("%")[0]!.toLowerCase();
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return "invalid";
  const groups = expandIpv6(ip);
  // ::ffff:a.b.c.d and its hex form ::ffff:xxxx:yyyy are the same IPv4 client.
  if (groups.slice(0, 6).join(":") === "0:0:0:0:0:ffff") {
    const [high, low] = groups.slice(6).map((g) => parseInt(g, 16));
    return [high! >> 8, high! & 255, low! >> 8, low! & 255].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** The 8 groups of a valid IPv6 address, without leading zeros; an embedded IPv4 tail becomes two groups. */
function expandIpv6(ip: string): string[] {
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  const hex = tail
    ? ip.slice(0, tail.index) +
      [
        ((Number(tail[1]) << 8) | Number(tail[2])).toString(16),
        ((Number(tail[3]) << 8) | Number(tail[4])).toString(16),
      ].join(":")
    : ip;
  const [head = "", rest] = hex.split("::");
  const left = head ? head.split(":") : [];
  const right = rest ? rest.split(":") : [];
  const groups =
    rest === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return groups.map((g) => g.replace(/^0+(?=.)/, ""));
}
