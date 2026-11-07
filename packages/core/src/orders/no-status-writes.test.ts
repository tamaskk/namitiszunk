import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../../../..");
const skipDirs = new Set(["node_modules", ".next", "dist", ".turbo", "build"]);
// Seed data and test fixtures may set a status directly; app code may not.
const allowed = (path: string) =>
  path === "packages/core/src/orders/transition.ts" ||
  /\.(test|spec)\.tsx?$/.test(path) ||
  /(^|\/)(seed|fixtures?)(\.ts|\/)/.test(path);

// shortcut: a text heuristic (Order writes naming `status`, `order.status =`), not type-aware; upgrade to an ESLint rule if it misses or misfires.
const orderWrite =
  /\bOrder(?:\.collection)?\.(?:updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite|findOneAndReplace)\s*\([\s\S]{0,400}?\bstatus\b/;
const assignment = /\border\.status\s*=[^=]/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return skipDirs.has(entry.name) ? [] : sourceFiles(join(dir, entry.name));
    }
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

describe("order status writes", () => {
  it("happen only in transition.ts", () => {
    const files = ["packages", "apps"].flatMap((d) =>
      sourceFiles(join(repoRoot, d)),
    );

    const offenders = files
      .map((file) => relative(repoRoot, file))
      .filter((path) => !allowed(path))
      .filter((path) => {
        const text = readFileSync(join(repoRoot, path), "utf8");
        return orderWrite.test(text) || assignment.test(text);
      });

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("catches a direct status update", () => {
    const code = `await Order.updateOne({ _id }, { $set: { status: "ready" } });`;

    expect(orderWrite.test(code)).toBe(true);
    expect(assignment.test("order.status = 'new'")).toBe(true);
    expect(assignment.test("order.status === 'new'")).toBe(false);
  });
});
