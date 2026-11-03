---
description: Fix a GitHub issue by number, or a described bug, end to end. Reproduce with a failing test, make the smallest fix, verify, summarize.
argument-hint: "<issue-number or bug description>"
allowed-tools:
  - Bash(gh issue view *)
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(graphify query *)
---

# Fix issue: $ARGUMENTS

1. **Understand.** If the argument is an issue number, run `gh issue view $ARGUMENTS --comments`. If `gh` is unavailable, ask me to paste the issue. Restate expected vs actual behaviour and how to reproduce it.
2. **Locate.** Find the code path with the knowledge graph: `graphify query "<question>"`, `graphify path "<A>" "<B>"`; then read only the located lines. Not Explore, not whole-file reads. Read the PRD feature it belongs to and the ARCHITECTURE boundaries it touches.
3. **Plan.** List the files you expect to change. More than five, or anything in docs/ARCHITECTURE.md §08 (new dependency, collection, service, auth, RBAC, payment, refund or state-machine change): stop and ask, with options and a recommendation.
4. **Branch.** On main, create `fix/<issue-number>-<short-slug>`. Ask first if there are uncommitted changes.
5. **Reproduce first.** Write a failing test at the lowest sensible level: a `packages/core` unit test first, e2e only for a broken critical flow. Run it and confirm it fails for the reason from step 1.
6. **Fix.** The smallest change that makes the test pass, following AGENTS.md and the rules. Fix the root cause once in shared code. No drive-by refactors.
7. **Verify.** Run the new test, the related suite, `pnpm lint` and `pnpm typecheck`. For UI changes, check 375px and both languages. Then `graphify update .`.
8. **Report.** Root cause in one or two sentences, the fix, the tests added, what you did not do, what I should check. Suggest a commit message: `fix(<scope>): <summary>` and `Fixes #<n>`. Do not commit or push unless I ask.
