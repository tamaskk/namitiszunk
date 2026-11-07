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
