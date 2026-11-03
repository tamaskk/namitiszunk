---
name: deploy
description: Deploy one of the apps (landing, order, admin, hq, api) to a preview or to production with the project's release checklist. Use only when the user explicitly asks to deploy.
argument-hint: "<preview or production> [app]"
disable-model-invocation: true
allowed-tools:
  - Bash(git status *)
  - Bash(git log *)
  - Bash(git fetch *)
  - Bash(pnpm lint)
  - Bash(pnpm typecheck)
  - Bash(pnpm test)
  - Bash(pnpm build)
---

# Deploy: $ARGUMENTS

Read `${CLAUDE_SKILL_DIR}/deploy-config.md` first: platform, method, projects, URLs, smoke checks, rollback. If any value there is still a [placeholder], stop and ask.

## 1. Preconditions (stop on any failure)
- The target is `preview` or `production`; the app (if given) is one of the five Vercel projects. Anything else: ask.
- The working tree is clean (`git status --porcelain` is empty).
- `production`: on `main`, up to date with origin (`git fetch`, then compare), and the latest CI run on it is green (`gh run list --branch main --limit 1`).
- `production`: never Friday or Saturday from 18:00 to 06:00 Budapest time (critical window); deploys happen on weekdays during the day. Outside that rule: stop and ask.
- `preview`: a feature branch.

## 2. Quality gate
Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Any failure: stop, report, do not deploy.

## 3. Deploy
- Follow the "Deploy method" in the config.
  - Git integration: preview = push the feature branch (ask first); production = merge the approved pull request. Tell me to merge it in GitHub unless I explicitly asked you to.
  - CLI fallback: `vercel deploy` (preview) or `vercel deploy --prod` from `apps/<app>`. Production always needs my explicit "yes" in this conversation, even though the hook asks too.
- Never change environment variables, domains, Stripe settings or project settings as part of a deploy.

## 4. Verify
- Wait for the deployment URL, then run the smoke checks from the config.
- Report: target, app(s), URL, commit SHA, checks and their results.

## 5. If something is wrong
Report first. Offer the rollback steps from the config; run them only after I say so.
