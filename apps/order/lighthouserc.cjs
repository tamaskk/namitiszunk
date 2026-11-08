// Lighthouse CI (T-049): the production build against the seeded in-memory Demo Klub, mobile profile.
// Reports LCP per page; see the assertion below for why it only warns.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- LHCI loads its config with require(), so this file is CommonJS.
const { createHash } = require("node:crypto");

// Not 3102: the JS budget run before this one serves there, and its server may still be closing.
const port = 3103;
// Same derivations as packages/db/src/seed.ts (seedId and the demo guest token).
const seedId = (key) =>
  createHash("sha256").update(`seed:${key}`).digest("hex").slice(0, 24);
const seedGuestToken = (key) =>
  createHash("sha256").update(`token:${key}`).digest("base64url").slice(0, 22);

const base = `http://localhost:${port}/hu`;
const qr = `bar=${seedId("bar:main")}&zone=${seedId("zone:dancefloor")}`;
// order:3 is the seeded order being prepared at the main bar.
const live = `${base}/o/${seedId("order:3")}?t=${seedGuestToken("order:3")}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `node e2e/serve.mts ${port} start`,
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 180000,
      url: [`${base}/v/demo?${qr}`, `${base}/v/demo/checkout?${qr}`, live],
      // The median of three runs evens out a noisy CI machine.
      numberOfRuns: 3,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertions: {
        // A warning until CI runs hold it (decision 2026-11-08): the simulated mobile LCP swings 1–2 s
        // between runs, while the observed LCP is under 1.5 s. The JS budget is enforced by
        // e2e/js-budget.perf.ts on the same build, since Lighthouse also counts the deferred chunks.
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
