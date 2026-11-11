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
const orderWriteCall =
  /\bOrder(?:\.collection)?\.(updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite|findOneAndReplace)\s*\(/g;

/** The call's arguments after the first one, up to its closing parenthesis. */
function argsAfterFirst(text: string, from: number): string {
  let depth = 0;
  let firstEnd = -1;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return firstEnd < 0 ? "" : text.slice(firstEnd, i);
      depth--;
    } else if (c === "," && depth === 0 && firstEnd < 0) firstEnd = i + 1;
  }
  return firstEnd < 0 ? "" : text.slice(firstEnd);
}

/** True when an Order write names `status` outside its filter (a filter on `status` is fine: a claim only while Ready). */
function writesOrderStatus(text: string): boolean {
  for (const match of text.matchAll(orderWriteCall)) {
    const start = match.index + match[0].length;
    // bulkWrite has no filter argument: any `status` in it counts.
    const updates =
      match[1] === "bulkWrite"
        ? text.slice(start, start + 400)
        : argsAfterFirst(text, start);
    if (/\bstatus\b/.test(updates)) return true;
  }
  return false;
}
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
        return writesOrderStatus(text) || assignment.test(text);
      });

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("catches a status update in any update shape", () => {
    const writes = [
      `await Order.updateOne({ _id }, { $set: { status: "ready" } });`,
      `await Order.updateOne({ _id }, { status: "ready" });`,
      `await Order.updateOne({ _id }, { "$set": { a: { b: 1 }, status } });`,
      `await Order.findByIdAndUpdate(id, { status });`,
      `await Order.findOneAndUpdate({ _id }, [{ $set: { status: "x" } }]);`,
      `await Order.bulkWrite([{ updateOne: { filter: {}, update: { status } } }]);`,
    ];

    const caught = writes.map(writesOrderStatus);

    expect(caught).toEqual(writes.map(() => true));
    expect(assignment.test("order.status = 'new'")).toBe(true);
    expect(assignment.test("order.status === 'new'")).toBe(false);
  });

  it("allows a status filter on a write that sets other fields", () => {
    const claim = `await Order.updateOne({ _id, status: "ready", reminderSentAt: null }, { $set: { reminderSentAt: now } });`;
    const move = `await Order.updateOne({ _id, status: { $in: ["new"] } }, { $set: { barId } }, { session });`;

    expect(writesOrderStatus(claim)).toBe(false);
    expect(writesOrderStatus(move)).toBe(false);
  });
});
