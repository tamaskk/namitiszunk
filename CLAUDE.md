@AGENTS.md

<!--
Maintainer notes (block comments are stripped from Claude's context):
- AGENTS.md is the tool-agnostic rulebook. Only Claude Code-specific guidance lives here.
- Keep this file under 120 lines. Procedures go to .claude/skills, file-type rules to .claude/rules with `paths`.
- The graphify section written by `graphify install --project --strict` is merged into "Token budget" below; .claude/CLAUDE.md was folded in here.
-->

# Claude Code guide: Na, mit iszunk?

## Snapshot
- Na, mit iszunk?: QR ordering and payment for nightclubs (namitiszunk.hu). Stage: building the web MVP for one pilot club.
- Stack: Turborepo + pnpm · Next.js App Router (landing, order, admin, hq, api) · Expo (phase 3) · TypeScript strict · Tailwind v4 + shadcn · MongoDB/Mongoose · Better Auth · Stripe Connect · Ably · Inngest · Vercel.
- The truth lives in docs/: PRD (what and why), DESIGN_SYSTEM (how it looks), ARCHITECTURE (where code goes), SECURITY, TASKS; full task specs in docs/fejlesztesi-terv.md (Hungarian). Read them as AGENTS.md §02 says; do not restate them here.
- The monorepo scaffold exists (T-012): 5 Next.js apps, an Expo shell and 7 packages; feature code starts with the next tasks.

## Commands
`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build` · `pnpm --filter @namitiszunk/<pkg> <script>`

## Harness map: use these instead of improvising
| When | Use |
| --- | --- |
| After a feature, before a PR | `/review-changes` (project rules + subagents) |
| Hunting correctness bugs in a diff | bundled `/code-review`; security pass: `/security-review` |
| Fixing a bug or an issue | `/fix-issue <number or description>` |
| Building a task from the plan | `new-feature` skill (`T-0xx` or `F#`) |
| Deploying | `/deploy <preview or production> <app>`, only when I ask |
| Independent review | subagents `code-reviewer`, `security-auditor`, `design-reviewer` |
| Finding code, broad code search | `graphify query "<question>"` (or `/graphify query`), `graphify path "<A>" "<B>"`, `graphify explain "<concept>"`; overview: graphify-out/GRAPH_REPORT.md. Not Explore, not whole-file reads |
| The graph is stale or missing | `graphify update .` (AST only, no API cost); first build: `/graphify .` after T-012 |
| Too much code, over-engineering | Ponytail is always on (full); `/ponytail-review` on a diff, `/ponytail-audit` on the codebase |
| Token savings check | `headroom savings` (the proxy runs outside this session; never start, stop or reroute it) |
| UI work | the `ui-component` skill loads for UI files |
| Proving a change works in the running app | bundled `/verify` (after `/run-skill-generator` ran once) |

## Working agreements (Claude Code)
- Plan first (plan mode or a written plan) when a task touches more than 5 files or anything in docs/ARCHITECTURE.md §08.
- Track multi-step work in the task list, one item in progress at a time.
- Verify before saying done: `pnpm typecheck` and the relevant tests. Say what you ran.
- Hooks in .claude/hooks enforce safety. If one blocks you, do not work around it: say what you wanted to run and why.
- Permissions: my user settings run in bypassPermissions mode, so `ask` rules may not prompt. Treat every `ask` entry in .claude/settings.json as "confirm with me in chat first".
- Only change .claude/**, .mcp.json or CLAUDE.md when the task is about the harness itself.
- A convention I correct twice belongs in AGENTS.md or .claude/rules, not only in auto memory: propose the edit.

## Token budget (AGENTS.md §10)
- Graph first. When graphify-out/graph.json exists, run `graphify query "<question>"` before the first grep, search or source-file read, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read located.
- graph-first.sh blocks reading source files before the graph exists, full reads of source files over 150 lines, unbounded content greps and `cat` dumps of source files. The graphify strict hook also blocks the first raw read per session until one `graphify query` runs.
- If graphify-out/wiki/index.md exists, use it for broad navigation. Read GRAPH_REPORT.md only for architecture-wide questions.
- After modifying code, run `graphify update .`.

## Gotchas
- Node 24 is the target (`.nvmrc` in T-012); this machine still has Node 22 — install with `nvm install 24` before scaffolding.
- React versions are pinned per app, not at the root (Expo and Next.js may need different React versions).
- If Metro cannot resolve pnpm symlinks, add `node-linker=hoisted` to `.npmrc`.
