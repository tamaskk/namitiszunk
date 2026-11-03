---
description: Review the current changes against this project's rules (PRD scope, DESIGN_SYSTEM tokens, ARCHITECTURE boundaries, AGENTS.md definition of done) with the project subagents. Read-only.
argument-hint: "[base-branch or commit-range]"
allowed-tools:
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git branch *)
---

# Review changes

## Context
- Branch: !`git branch --show-current`
- Working tree: !`git status --short`
- Changed files vs HEAD: !`git diff --stat HEAD`
- Recent commits: !`git log --oneline -10`

## Scope
Review `$ARGUMENTS` if given (a base branch such as `main`, or a range such as `abc123..HEAD`). Otherwise review the uncommitted changes plus the commits on this branch that are not on the default branch.

## Steps
1. Get the full diff for the range. Group the changed files by area: UI (apps/*, packages/ui), API/services (apps/api, packages/core, packages/validators), database (packages/db), config, tests, docs.
2. Delegate in parallel:
   - `code-reviewer`: the range and the changed files.
   - `security-auditor`: only if the diff touches auth, RBAC, sessions, PIN, guest tokens, payments, refunds, fees, webhooks, uploads, external input, secrets or data deletion.
   - `design-reviewer`: only if UI files changed.
3. While they run, check the project contract yourself:
   - PRD §07: nothing out of scope was built. The task's acceptance criteria (docs/fejlesztesi-terv.md) are met.
   - ARCHITECTURE §05: no forbidden imports (apps → packages/db or secret SDKs, packages/core → apps/ui/React, mobile → core/db). Grep the changed files.
   - ARCHITECTURE §06: no "fix" of an intentional decision (integer money, item snapshots, single transition function, archive-not-delete).
   - DESIGN_SYSTEM: no raw hex or off-scale spacing in changed UI; loading, empty and error states; copy from i18n in hu and en.
   - AGENTS.md §07: core logic has tests; docs changed if structure, decisions or components changed.
4. Merge and deduplicate the findings. Output:
   - Verdict: **Ready for PR** or **Changes required**.
   - Table: `Severity (Blocker / Major / Minor / Nit) | File:line | Finding | Suggested fix`.
   - "Checked, no issues": one line per area.
5. Do not edit files. Offer to fix the Blockers and Majors.

Deeper passes: bundled `/code-review` (correctness bugs; effort levels; `--fix`), `/security-review` (branch diff against origin), bundled `/simplify` (cleanup), `/ponytail-review` (over-engineering).
