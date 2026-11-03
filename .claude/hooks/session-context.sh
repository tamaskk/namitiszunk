#!/usr/bin/env bash
# .claude/hooks/session-context.sh
# SessionStart hook. Prints a short, cheap snapshot; Claude Code adds a
# SessionStart hook's plain stdout to Claude's context. Keep it under ~20 lines.
set -u
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" 2>/dev/null || exit 0

echo "## Session context (.claude/hooks/session-context.sh)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch="$(git branch --show-current 2>/dev/null)"
  dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d '[:space:]')"
  echo "- Branch: ${branch:-detached HEAD} | uncommitted files: ${dirty}"
  echo "- Recent commits:"
  git log --oneline -5 2>/dev/null | sed 's/^/  - /'
  case "$branch" in
    main|master) echo "- You are on ${branch}: create a feature branch before changing code." ;;
  esac
else
  echo "- Not a git repository yet."
fi

# Token stack: Headroom proxy, graphify knowledge graph
port="${HEADROOM_PORT:-8787}"
if curl -sf --max-time 1 "http://127.0.0.1:${port}/readyz" >/dev/null 2>&1; then
  case "${ANTHROPIC_BASE_URL:-}" in
    http://127.0.0.1:*|http://localhost:*) echo "- Headroom: proxy up, this session is routed through it." ;;
    *) echo "- Headroom: proxy up on :${port}, but ANTHROPIC_BASE_URL is not set in this session; tell the user if savings stay at zero (headroom savings)." ;;
  esac
else
  echo "- WARNING: Headroom proxy is not running. Tell the user to restart with: headroom wrap claude --code-memory none"
fi

if [ -f graphify-out/graph.json ]; then
  stale="$(find . -type f -newer graphify-out/graph.json \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.cjs' \) \
    -not -path '*/node_modules/*' -not -path './.next/*' -not -path './.claude/*' -not -path './graphify-out/*' \
    -not -path './dist/*' -not -path './build/*' 2>/dev/null | head -1)"
  if [ -n "$stale" ]; then
    echo "- Graph is stale (${stale#./} changed after the last build): run 'graphify update .' before relying on it."
  else
    echo "- Graph: graphify-out/graph.json is current. Query it before opening code files."
  fi
else
  echo "- No knowledge graph yet: build it with '/graphify .' (after T-012) before reading code."
fi

if [ -f docs/TASKS.md ]; then
  open_tasks="$(grep -E '^[[:space:]]*- \[ \]' docs/TASKS.md | head -5)"
  if [ -n "$open_tasks" ]; then
    echo "- Next open tasks (docs/TASKS.md):"
    printf '%s\n' "$open_tasks" | sed 's/^[[:space:]]*/  /'
  fi
fi
exit 0
