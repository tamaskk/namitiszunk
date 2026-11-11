import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const v1 = fileURLToPath(new URL("../app/v1/", import.meta.url));
const routes = readdirSync(v1, { recursive: true, encoding: "utf8" }).filter(
  (file) => /(^|\/)route\.ts$/.test(file),
);

// CI check (T-029): every /v1 HTTP method is `export const METHOD = handler(...)`.
describe("every /v1 route goes through the handler wrapper", () => {
  it("finds the /v1 routes", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)("%s", (file) => {
    const source = readFileSync(v1 + file, "utf8");

    const exported = [
      ...source.matchAll(
        /export\s+(?:async\s+)?(?:const|function|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
      ),
    ].map((m) => m[1]);
    const wrapped = [
      ...source.matchAll(
        /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*handler\(/g,
      ),
    ].map((m) => m[1]);
    const reExported =
      /export\s*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(
        source,
      );

    expect(exported.length).toBeGreaterThan(0);
    expect(wrapped).toEqual(exported);
    expect(reExported).toBe(false);
  });

  // Fail closed: each handler() call names its auth and permission, "public" / "none" included.
  it.each(routes)("%s declares auth and permission per method", (file) => {
    const source = readFileSync(v1 + file, "utf8");

    const calls = source.split(/=\s*handler\(/).slice(1);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/\bauth\s*:/);
      expect(call).toMatch(/\bpermission\s*:/);
    }
  });
});

// CI check (T-023): `permission: "none"` only on reviewed routes. A new route that skips
// requirePermission fails here until someone adds it with the reason it is safe.
const noPermissionRoutes: Record<string, string> = {
  "ping/route.ts": "public health probe, no data",
  "openapi.json/route.ts": "public API description, no data",
  "orders/route.ts": "guest order creation, prices loaded on the server",
  "orders/quote/route.ts": "checkout price preview, stores nothing",
  "orders/[id]/route.ts": "guestCaller proves the order's token",
  "orders/[id]/cancel/route.ts": "transition() checks order.reject (own)",
  "orders/[id]/review/route.ts": "guestCaller proves the order's token",
  "orders/[id]/report/route.ts": "guestCaller proves the order's token",
  "orders/[id]/confirmation-email/route.ts":
    "guestCaller proves the order's token",
  "realtime/token/route.ts": "createTokenRequest checks RBAC per channel",
  "orders/[id]/reorder/route.ts": "guestCaller proves the order's token",
  "me/route.ts": "accountCaller: the guest's own account only",
  "me/orders/route.ts": "accountCaller: the guest's own orders only",
  "me/orders/claim/route.ts": "each order proven by its guest token in core",
  "me/orders/[id]/reorder/route.ts":
    "core answers 404 unless the account owns it",
  "me/export/route.ts": "accountCaller: the guest's own data only",
  // The bar view (T-054): the venue is known only after loading the bar or order, so core checks it.
  "bars/[id]/orders/route.ts":
    "getBarView checks order.start on the bar's venue",
  "bars/[id]/pause/route.ts": "setBarPaused checks bar.pauseOrders",
  "orders/[id]/status/route.ts": "transition() checks order.<event>",
  "orders/[id]/reject/route.ts":
    "rejectFromBar checks order.reject and product.setSoldOut",
  "orders/[id]/receipt/route.ts": "setReceiptEntered checks order.markReceipt",
  "orders/[id]/reminder/route.ts":
    "sendReminderFromBar checks order.sendReminder",
  "orders/[id]/move/route.ts":
    "moveOrderToBar checks order.moveBar and the target bar's venue",
};

describe("only reviewed /v1 routes skip the permission check", () => {
  it('matches the list of routes with permission "none"', () => {
    const skipping = routes.filter((file) =>
      /\bpermission\s*:\s*["']none["']/.test(readFileSync(v1 + file, "utf8")),
    );

    expect(skipping.sort()).toEqual(Object.keys(noPermissionRoutes).sort());
  });
});

// Routes outside /v1 bypass handler(); each one authenticates on its own.
const nonV1Routes: Record<string, string> = {
  "api/inngest/route.ts": "Inngest serve() verifies the signing key",
  "debug/sentry/route.ts": "shared bearer token, 404 otherwise",
  "health/route.ts": "public health probe, no data",
  "webhooks/stripe/route.ts": "Stripe signature on the raw body",
};

describe("only reviewed routes live outside /v1", () => {
  it("matches the list of non-/v1 routes", () => {
    const app = fileURLToPath(new URL("../app/", import.meta.url));

    const found = readdirSync(app, {
      recursive: true,
      encoding: "utf8",
    }).filter(
      (file) => /(^|\/)route\.ts$/.test(file) && !file.startsWith("v1/"),
    );

    expect(found.sort()).toEqual(Object.keys(nonV1Routes).sort());
  });
});
