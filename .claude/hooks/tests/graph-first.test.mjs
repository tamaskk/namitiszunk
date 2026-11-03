// .claude/hooks/tests/graph-first.test.mjs
// Run: node .claude/hooks/tests/graph-first.test.mjs  (re-run after every change to the hook)
// Builds a throwaway project in the OS temp dir and feeds sample payloads to graph-first.sh.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hook = fileURLToPath(new URL("../graph-first.sh", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "graph-first-"));
const lines = (n) => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";
for (const d of ["src/lib", "docs", ".claude/hooks/tests", "node_modules/pkg"]) mkdirSync(join(root, d), { recursive: true });
writeFileSync(join(root, "src/lib/small.ts"), lines(20));
writeFileSync(join(root, "src/lib/big.ts"), lines(400));
writeFileSync(join(root, "docs/PRD.md"), "# PRD\n".repeat(500));
writeFileSync(join(root, "next.config.ts"), lines(10));
writeFileSync(join(root, ".claude/hooks/tests/x.test.mjs"), lines(300));
writeFileSync(join(root, "node_modules/pkg/index.d.ts"), lines(50));

const read = (file_path, extra = {}) => ({ tool_name: "Read", tool_input: { file_path: join(root, file_path), ...extra } });
const grep = (input) => ({ tool_name: "Grep", tool_input: { pattern: "foo", ...input } });
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

// [label, payload, expected, graphExists]
const cases = [
  ["no graph: read markdown", read("docs/PRD.md"), "none", false],
  ["no graph: read small code file", read("src/lib/small.ts"), "deny", false],
  ["no graph: read config .ts", read("next.config.ts"), "deny", false],
  ["no graph: read .claude test file (ranged)", read(".claude/hooks/tests/x.test.mjs", { offset: 1, limit: 50 }), "none", false],
  ["no graph: read node_modules types", read("node_modules/pkg/index.d.ts"), "none", false],
  ["no graph: read outside project", { tool_name: "Read", tool_input: { file_path: "/etc/hosts" } }, "none", false],
  ["graph: read small code file", read("src/lib/small.ts"), "none", true],
  ["graph: read big code file, no range", read("src/lib/big.ts"), "deny", true],
  ["graph: read big code file, offset+limit", read("src/lib/big.ts", { offset: 100, limit: 40 }), "none", true],
  ["graph: read big code file, limit only", read("src/lib/big.ts", { limit: 60 }), "none", true],
  ["graph: read big markdown", read("docs/PRD.md"), "none", true],
  ["graph: read big .claude file, no range", read(".claude/hooks/tests/x.test.mjs"), "deny", true],
  ["grep default mode", grep({}), "none", true],
  ["grep files_with_matches", grep({ output_mode: "files_with_matches" }), "none", true],
  ["grep count", grep({ output_mode: "count" }), "none", true],
  ["grep content, no head_limit", grep({ output_mode: "content" }), "deny", true],
  ["grep content, head_limit 0 (unlimited)", grep({ output_mode: "content", head_limit: 0 }), "deny", true],
  ["grep content, head_limit 500", grep({ output_mode: "content", head_limit: 500 }), "deny", true],
  ["grep content, head_limit 30", grep({ output_mode: "content", head_limit: 30 }), "none", true],
  ["glob is ignored", { tool_name: "Glob", tool_input: { pattern: "**/*.ts" } }, "none", true],
  ["bash: cat big code file", bash("cat src/lib/big.ts"), "deny", true],
  ["bash: cat small code file", bash("cat src/lib/small.ts"), "none", true],
  ["bash: cat small code file, no graph", bash("cat src/lib/small.ts"), "deny", false],
  ["bash: cat -n big file in a pipe", bash("cat -n src/lib/big.ts | grep foo"), "deny", true],
  ["bash: ranged sed on big file", bash("sed -n '100,140p' src/lib/big.ts"), "none", true],
  ["bash: head on big file", bash("head -40 src/lib/big.ts"), "none", true],
  ["bash: cat markdown", bash("cat docs/PRD.md"), "none", true],
  ["bash: heredoc write", bash("cat > src/lib/new.ts <<'EOF'\nexport const a = 1;\nEOF"), "none", true],
  ["bash: unrelated command", bash("npm run test -- --run"), "none", false],
];

let failed = 0;
for (const [label, payload, expected, graphExists] of cases) {
  rmSync(join(root, "graphify-out"), { recursive: true, force: true });
  if (graphExists) { mkdirSync(join(root, "graphify-out")); writeFileSync(join(root, "graphify-out/graph.json"), "{}"); }
  const r = spawnSync("bash", [hook], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: root, ...payload }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  let got = r.status === 0 ? "none" : `exit ${r.status}`;
  if (r.status === 0 && r.stdout.trim()) got = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} expected=${expected.padEnd(4)} got=${got.padEnd(4)} ${label}`);
}
rmSync(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${cases.length} FAILED` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
