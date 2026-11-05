# Monitoring and alerts (T-017)

Errors go to Sentry, outages to Better Stack, and both reach the phone as a push. Critical window: Friday–Saturday 20:00–05:00 (docs/SECURITY.md).

## What the code does

- `@sentry/nextjs` in all five web apps (`apps/*/instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`). Shared options: `packages/config/src/sentry.ts`.
  - One Sentry project per app (`namitiszunk-landing`, `-order`, `-admin`, `-hq`, `-api` in the `namitiszunk` org, EU region), so alert rules and quota can differ per app. Events still carry the `app` tag.
  - `environment` is the Vercel environment (production, preview, development).
  - Release = git SHA (`VERCEL_GIT_COMMIT_SHA`); source maps are uploaded and then deleted from the deployment, production builds only.
  - SDK v11 collects everything by default, so `dataCollection` turns off user info, cookies, bodies, query strings, local variables and DB query data, and keeps only the `user-agent`, `content-type` and `accept-language` request headers. `sentryOptions` is typed with `satisfies Options`, so a renamed SDK option fails typecheck.
  - `scrubPii` / `scrubSpan` on events, transactions, spans and breadcrumbs: no user identity, cookies, auth headers, IP or request attributes; emails and phone numbers (also percent-encoded) become `[email]` / `[phone]`; fields such as `phone`, `pin`, `otp`, `token` become `[Filtered]`.
- `GET api.namitiszunk.hu/health`: 200 `{"status":"ok"}`, or 503 when `HEALTH_FORCE_FAIL=1`. The MongoDB ping arrives with T-020.
- `POST api.namitiszunk.hu/debug/sentry` with `Authorization: Bearer $SENTRY_TEST_TOKEN` throws a test error; without the token it answers 404.

## One-time setup (owner)

1. **Sentry** (done 2026-11-04): the `namitiszunk` org (EU region) with five projects, platform Next.js. One org auth token (`project:releases`, `org:read`) for source map uploads, shared by all five.
   - Each project → Security & Privacy: "Prevent Storing of IP Addresses" on, Data Scrubber on with the default rules, Advanced Data Scrubbing rules for emails and international phone numbers on all strings.
   - Each project: Allowed Domains `namitiszunk.hu`, `*.namitiszunk.hu`, `*.vercel.app`; Spike Protection on. The DSN is public, so this is what stops quota abuse. The free plan does not accept a per-key rate limit; set one (Client Keys) after upgrading.
2. **Vercel**, for all five projects:
   - Settings → Environment Variables: turn on "Automatically expose System Environment Variables". Browser events read their environment from `NEXT_PUBLIC_VERCEL_ENV`, and production builds fail without it.
   - Production and Preview: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (the same DSN; not on api), `SENTRY_ORG=namitiszunk`, `SENTRY_PROJECT=namitiszunk-<app>`, each with that app's own DSN.
   - Production only: `SENTRY_AUTH_TOKEN` (the org auth token, type Sensitive).
   - `namitiszunk-api`: also `SENTRY_TEST_TOKEN` (at least 32 random characters, e.g. `openssl rand -hex 32`, type Sensitive), Production and Preview. Rotate it if it ever leaks. `HEALTH_FORCE_FAIL` is refused in production builds.
3. **Better Stack** (Uptime): install the phone app and allow critical alerts.
   - Monitors, every 1 minute, alert after 2 failed checks in a row: `https://api.namitiszunk.hu/health` (expects 200), the order page of the demo venue, `https://admin.namitiszunk.hu`, `https://namitiszunk.hu`. The domains go live with T-005; until then use the `*.vercel.app` URLs.
   - On-call: push and critical alert to the phone, Friday–Saturday 20:00–05:00 escalate with a phone call.
4. **Sentry alert rules**, sent to Better Stack through its Sentry integration (incoming webhook):
   - A new issue in `environment:production`.
   - More than 10 errors in 5 minutes in `namitiszunk-api`.
5. **Stripe**: Settings → Team and security → notifications: turn on email for failed webhook deliveries.

## Checks (acceptance criteria)

- Test error in production:
  `curl -X POST -H "Authorization: Bearer $SENTRY_TEST_TOKEN" https://api.namitiszunk.hu/debug/sentry`
  The issue must appear in Sentry with the release (git SHA) and a readable TypeScript stack trace.
- Outage alert: set `HEALTH_FORCE_FAIL=1` on a preview of `namitiszunk-api`, point a temporary Better Stack monitor at that preview's `/health`, and expect a push within 3 minutes. Remove the variable afterwards.
- No PII: the test error text contains no email or phone number in Sentry (unit tests in `packages/config/src/sentry.test.ts` cover the masking).

## Tuning

After the first two pilot weekends, raise the thresholds that fired without a real incident, so the pushes stay worth reading.
