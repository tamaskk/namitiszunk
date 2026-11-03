#!/usr/bin/env bash
# .claude/hooks/graph-first.sh
# PreToolUse hook (matcher: "Read|Grep|Bash"). Enforces graph-first code
# navigation with graphify, to stop token burn from blind file reads:
#   Read of a source file while graphify-out/graph.json is missing -> deny
#   Read of a source file over MAX_LINES lines without offset/limit -> deny
#   Bash cat/bat/less/more/nl/tac of a source file -> same two rules as Read
#   Grep in "content" mode without head_limit, or head_limit > MAX_GREP -> deny
#   anything else (docs, configs, markdown, small files, ranged reads) -> no opinion
# Thresholds: GRAPH_FIRST_MAX_LINES (default 150), GRAPH_FIRST_MAX_GREP (default 100).
# Reads under .claude/ and node_modules/ skip the graph gate (the size rule
# still applies). Needs bash + node. Fails open (no node -> no opinion): the
# harness requires Node anyway, and validate-bash.sh already fails closed.
set -u
command -v node >/dev/null 2>&1 || exit 0

IFS= read -r -d '' RULES_JS <<'JS' || true
const fs = require("fs");
const path = require("path");

const MAX_LINES = Number(process.env.GRAPH_FIRST_MAX_LINES || 150);
const MAX_GREP = Number(process.env.GRAPH_FIRST_MAX_GREP || 100);
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|scala|cs|php|rb|c|h|cpp|hpp|swift|vue|svelte)$/i;
const GATE_EXEMPT = /(^|\/)(\.claude|node_modules)\//;

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: `Project policy (.claude/hooks/graph-first.sh): ${reason}`,
    },
  }));
  process.exit(0);
}

function lineCount(file) {
  try {
    const buf = fs.readFileSync(file);
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return buf.length && buf[buf.length - 1] !== 10 ? n + 1 : n;
  } catch { return 0; }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const tool = input.tool_name || "";
  const t = input.tool_input || {};
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const graph = path.join(root, "graphify-out", "graph.json");
  const hasGraph = fs.existsSync(graph);

  if (tool === "Grep") {
    if ((t.output_mode || "files_with_matches") !== "content") process.exit(0);
    const limit = Number(t.head_limit);
    if (!Number.isFinite(limit) || limit === 0 || limit > MAX_GREP) {
      decide("deny", `Grep in content mode needs head_limit <= ${MAX_GREP}. Locate code with ` +
        "`graphify query \"<question>\" --graph graphify-out/graph.json --budget 1500` first, " +
        "or use output_mode files_with_matches, then Read the exact lines with offset/limit.");
    }
    process.exit(0);
  }

  // Returns a deny reason for reading `p` in full (ranged = false) or in part.
  function checkFile(p, ranged) {
    const file = path.resolve(input.cwd || root, String(p || ""));
    if (!CODE_EXT.test(file)) return null;
    const rel = path.relative(root, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    if (!hasGraph && !GATE_EXEMPT.test(rel)) {
      return "no knowledge graph yet (graphify-out/graph.json is missing). Build it first with " +
        "the /graphify skill on the source folder (e.g. `/graphify ./src`), then query it before reading code.";
    }
    if (ranged) return null;
    const n = lineCount(file);
    if (n > MAX_LINES) {
      return `${rel} has ${n} lines; full reads over ${MAX_LINES} lines are blocked. ` +
        "Find the relevant symbol with `graphify query \"<question>\" --graph graphify-out/graph.json --budget 1500`, " +
        "then Read only that part with offset/limit.";
    }
    return null;
  }

  if (tool === "Read") {
    const reason = checkFile(t.file_path, t.offset !== undefined || t.limit !== undefined);
    if (reason) decide("deny", reason);
    process.exit(0);
  }

  // Bash: whole-file dumps of source files (cat and friends) get the same rules as Read.
  if (tool === "Bash") {
    const DUMP_CMDS = new Set(["cat", "bat", "less", "more", "nl", "tac"]);
    for (const seg of String(t.command || "").split(/\|\||&&|;|\||\n/)) {
      if (/[<>]/.test(seg)) continue; // heredocs and redirects write files, they do not dump them
      const toks = seg.trim().split(/\s+/).filter(Boolean);
      if (!DUMP_CMDS.has((toks[0] || "").replace(/^.*\//, ""))) continue;
      for (const arg of toks.slice(1)) {
        if (arg.startsWith("-")) continue;
        const reason = checkFile(arg.replace(/^["']|["']$/g, ""), false);
        if (reason) decide("deny", `${reason} Do not dump source files with ${toks[0]}.`);
      }
    }
    process.exit(0);
  }
  process.exit(0);
});
JS

exec node -e "$RULES_JS"
