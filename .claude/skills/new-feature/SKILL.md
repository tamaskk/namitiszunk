---
name: new-feature
description: Implement a task from docs/fejlesztesi-terv.md / docs/TASKS.md or a PRD feature end to end - plan, thin vertical slices, tests, acceptance criteria, task list update. Use when the user asks to build a feature or task (T-0xx, #nn or F#).
argument-hint: "<task id (T-040) or feature id (F1)>"
---

# New feature: $ARGUMENTS

1. Find the task in docs/fejlesztesi-terv.md (section 2, "#### <number>.") and in docs/TASKS.md, and its feature in PRD §05. Restate the goal, the acceptance criteria ("Elfogadási feltételek"), the dependencies and the out-of-scope neighbours (PRD §07). Not in the plan or the PRD: stop and ask whether to add it first. A dependency not done: say so and ask.
2. Read docs/ARCHITECTURE.md (where code goes, boundaries, §06), docs/DESIGN_SYSTEM.md for UI, docs/SECURITY.md for auth, payments or personal data.
3. Locate existing code through the graph (`graphify query "<question>"`), not by reading whole files.
4. Plan in plan mode, or present a plan: vertical slices (validators + core service → API route or action → UI), files and tests per slice, risks. More than five files in a slice, or anything in ARCHITECTURE §08: ask. Wait for approval.
5. Branch `feat/<task-number>-<slug>`.
6. Per slice: tests first for core logic (Arrange-Act-Assert), implement, run `pnpm test` and `pnpm typecheck` for the touched packages, `graphify update .`.
7. Finish: every acceptance criterion is observable; loading, empty and error states; 375px; hu and en copy; TASKS.md box ticked; docs updated if structure or decisions changed.
8. Suggest `/review-changes` before the pull request.
