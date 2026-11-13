import { afterEach, describe, expect, it, vi } from "vitest";

import { clientIp, ipPrefixKey } from "./client-ip";

const request = (forwardedFor?: string) =>
  new Request("https://namitiszunk.hu/", {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for address", () => {
    expect(clientIp(request("203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
  });

  it("keys an IPv6 address on its /64, so one host cannot rotate addresses", () => {
    expect(ipPrefixKey("2001:db8:a:b:1:2:3:4")).toBe("2001:db8:a:b::/64");
    expect(ipPrefixKey("2001:DB8:A:B::9")).toBe("2001:db8:a:b::/64");
    expect(ipPrefixKey("2001:0db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipPrefixKey("::1")).toBe("0:0:0:0::/64");
  });

  it("keeps an IPv4-mapped IPv6 address as the IPv4 address, in either form", () => {
    expect(ipPrefixKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipPrefixKey("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(ipPrefixKey("::ffff:203.0.113.7%eth0")).toBe("203.0.113.7");
  });

  it("drops an IPv6 zone id before keying", () => {
    expect(ipPrefixKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("never throws on a value that is not an address, and shares one key for all of them", () => {
    expect(ipPrefixKey("1:2:3:4:5::6:7:8:9")).toBe("invalid");
    expect(ipPrefixKey("203.0.113.7:443")).toBe("invalid");
    expect(ipPrefixKey("[2001:db8::1]:443")).toBe("invalid");
  });

  it("reads a missing address as local outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(clientIp(request())).toBe("local");
  });

  it("returns null for a missing address in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(clientIp(request())).toBeNull();
    expect(clientIp(request(" "))).toBeNull();
  });
});
