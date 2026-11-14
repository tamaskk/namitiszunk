# AGENTS.md

Instructions for any AI coding agent working in this project
(Claude Code, Cursor, Codex, Copilot). Read this whole file before doing anything.

## 01 Purpose

Na, mit iszunk? is an ordering and payment system for nightclubs: guests order and pay
on their phone, the bar gets the order on a live list, the guest is told when to pick it up.
It handles real money and personal data. Your job is to extend it without breaking what
exists, in the style already established. When in doubt, match what is there.

## 02 Before you start

Do these in order before product or code work:

1. Read docs/PRD.md for what we are building and what is out of scope.
2. Before any UI work, read docs/DESIGN_SYSTEM.md. Use its tokens.
3. Before any structural, data or backend work, read docs/ARCHITECTURE.md for where code lives and what may touch what.
4. Check `packages/ui` before creating a new component.
5. Find the code you need through the knowledge graph (§10), not by reading files one by one.
6. Look at docs/TASKS.md (and the task's detail in docs/fejlesztesi-terv.md, Hungarian) before proposing new work.
7. Restate the task in one or two sentences and list the files you expect
   to touch. Wait for a go-ahead if that list is longer than five files.

## 03 General rules

- Follow the design system. If a value is not in DESIGN_SYSTEM.md, ask. Do not invent it.
- Keep responsibilities where ARCHITECTURE.md puts them. Business logic lives in `packages/core`, never in pages, components or route handlers.
- Reuse before creating. Search the codebase for an existing helper or component first.
- Small, focused changes. One task, one branch, one clear diff.
- Do not add dependencies, collections, environment variables, or third-party services without asking.
- Do not delete or rewrite working code the task does not require.
- Never "improve" anything listed under intentional decisions in ARCHITECTURE.md §06.
- Leave the project runnable after every change.
- Money is integer forints. Never use floats for amounts; totals are computed on the server only.
- Order status changes only through `packages/core/src/orders/transition.ts`.
- Every user-facing string goes through `packages/i18n` (hu and en). No hard-coded copy.

## 04 Code guidelines

- TypeScript strict. No `any`. No `@ts-ignore` without a comment saying why.
- Functional components, hooks, named exports (except where the framework requires a default export, e.g. Next.js page and layout files, Expo Router screens).
- Validate every external input (forms, routes, webhooks) with a schema from `packages/validators` before it reaches a service.
- Name things by what they do: `sendReadySms`, not `handleSms2`.
- Comments explain why, not what. Delete commented-out code.
- Every data-driven view handles loading, empty, and error states.
- UI copy follows the tone rules in DESIGN_SYSTEM.md: plain, short, no exclamation marks.
- Tests cover business logic in `packages/core` (state machine, pricing, permissions first). UI tests only for critical flows.
- Formatting is the formatter's job. Run it. Do not argue with it.

## 05 Security and best practices

- Secrets live in environment variables and are read on the server only.
  Never log them, never send them to the client.
- Authorization is checked on every server entry point, not just in the UI.
- Escape and validate everything that comes from a user, a webhook, or a third party.
- Rate limit public endpoints. Never trust a client-supplied user id, venue id, role or price.
- No new auth flow, payment path, refund behavior or data deletion behavior without explicit approval.
- Read docs/SECURITY.md before changing auth, payments, data handling, uploads, secrets or deletion. Where it is stricter than this section, it wins.

## 06 Useful commands

Run from the repo root. `pnpm test:e2e` runs Playwright (the admin UI showcase, the order app guest pages and the HQ sign-in and 2FA against an in-memory MongoDB, all with axe-core; install the browser once with `pnpm --filter @namitiszunk/admin exec playwright install chromium`).

```
pnpm install           install dependencies
pnpm dev               start all apps (landing 3000, order 3001, admin 3002, hq 3003, api 3004)
pnpm build             production build (must pass before a PR)
pnpm lint              lint
pnpm typecheck         type check
pnpm test              unit tests (Vitest; Jest in apps/mobile)
pnpm test:e2e          end-to-end tests (Playwright)
pnpm format            format the codebase
pnpm --filter @namitiszunk/<pkg> <script>   run a script in one package
```

If a command fails, report the exact output. Do not work around it silently.

## 07 Definition of done

A task is done when all of these are true:
- The change does what the task asked, and nothing else.
- Build, lint, typecheck, and tests pass locally.
- New UI matches DESIGN_SYSTEM.md, works at 375px wide (guest) or on a landscape tablet (bar view), in hu and en.
- Docs are updated if a structure, a decision, or a component changed.
- The task's acceptance criteria in docs/fejlesztesi-terv.md are met, and docs/TASKS.md is ticked.
- The summary says what changed, what was not done, and what the user should check.

## 08 When to stop and ask

Stop and ask instead of guessing when:
- The task conflicts with the PRD, the design system, or an architectural boundary.
- Two reasonable readings of the task lead to different work.
- The change needs a new dependency, collection, secret, or service.
- It touches money, refunds, fees, RBAC or the order state machine in a way the task did not spell out.
- Something is broken that the task did not mention.

Ask with the specific question, the options you see, and your recommendation.

## 09 Git workflow

- Never commit to main directly. Branches: feat/<slug>, fix/<issue>-<slug>, chore/<slug>, docs/<slug>.
- Conventional Commits: `type(scope): summary` (feat, fix, refactor, test, docs, chore, perf). Scope = app or package name (`feat(order): ...`, `fix(core): ...`).
- One logical change per commit. Never commit secrets, .env files or build output.
- Do not push, force-push, rebase shared branches, or merge pull requests unless the user asks.
- Pull request description: what changed, why, how it was verified, screenshots for UI.

## 10 Context budget

- Navigate code through the knowledge graph in graphify-out/: GRAPH_REPORT.md for the overview,
  `graphify query "<question>" --graph graphify-out/graph.json --budget 1500` for specifics,
  `graphify path "<A>" "<B>"` for relationships. Do not read whole source files to find something.
- Open only the lines you need. A whole-file read is for small files, or right before editing one.
- After code changes, refresh the graph: `graphify update .` (AST only, no API cost; a post-commit hook also rebuilds it).
- Write the least code that works: reuse what exists, then the standard library, then installed
  dependencies, then new code. Never cut validation, error handling, security or accessibility to save lines.
- Keep command output short (tail, --silent, --oneline). Do not paste large logs into the conversation.
