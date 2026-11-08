import { gzipSync } from "node:zlib";

import { expect, test } from "@playwright/test";

import { seedGuestToken, seedId } from "./db";

// T-040 decision (2026-11-08): framework baseline (React, Next.js, next-intl; ~146 KB gzip) plus at
// most 50 KB of the page's own initial JS. Initial = the chunk script tags in the server HTML, minus
// the noModule polyfills modern browsers skip; lazy imports (Sentry, Stripe, Ably) load later and
// stay outside. Counted from the HTML, not the network, so load timing cannot change the sum.
const budgetBytes = (146 + 50) * 1024;

const qr = `bar=${seedId("bar:main")}&zone=${seedId("zone:dancefloor")}`;

const pages = [
  { name: "menu", path: `/hu/v/demo?${qr}` },
  { name: "checkout", path: `/hu/v/demo/checkout?${qr}` },
  {
    name: "live order",
    path: `/hu/o/${seedId("order:3")}?t=${seedGuestToken("order:3")}`,
    // Ably loads after the first paint (live-realtime.ts): the SDK (its host name) must not be here.
    lazy: "ably.io",
  },
];

for (const { name, path, lazy } of pages) {
  test(`${name}: initial JS within budget`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const chunks = new Set(
      [...html.matchAll(/<script\b[^>]*>/g)]
        .map(([tag]) => tag)
        .filter((tag) => !/\bnomodule\b/i.test(tag))
        .map(
          (tag) =>
            /src="(\/_next\/static\/chunks\/[^"?]+\.js)[^"]*"/.exec(tag)?.[1],
        )
        .filter((src): src is string => !!src),
    );

    let total = 0;
    for (const chunk of chunks) {
      const response = await request.get(chunk);
      expect(response.ok(), chunk).toBe(true);
      const body = await response.body();
      if (lazy) expect(body.includes(lazy), `${lazy} in ${chunk}`).toBe(false);
      total += gzipSync(body).length;
    }

    console.log(
      `${name}: ${(total / 1024).toFixed(1)} KB gzip initial JS (${chunks.size} chunks)`,
    );
    expect(chunks.size).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(budgetBytes);
  });
}
