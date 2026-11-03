# Monitoring and alerts (T-017)

Errors go to Sentry, outages to Better Stack, and both reach the phone as a push. Critical window: Friday–Saturday 20:00–05:00 (docs/SECURITY.md).

## What the code does

- `@sentry/nextjs` in all five web apps (`apps/*/instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`). Shared options: `packages/config/src/sentry.ts`.
  - One Sentry project; every event carries the `app` tag (landing, order, admin, hq, api).
  - `environment` is the Vercel environment (production, preview, development).
  - Release = git SHA (`VERCEL_GIT_COMMIT_SHA`); source maps are uploaded and then deleted from the deployment, production builds only.
  - SDK v11 collects everything by default, so `dataCollection` turns off user info, cookies, bodies, query strings, local variables and DB query data, and keeps only the `user-agent`, `content-type` and `accept-language` request headers. `sentryOptions` is typed with `satisfies Options`, so a renamed SDK option fails typecheck.
  - `scrubPii` / `scrubSpan` on events, transactions, spans and breadcrumbs: no user identity, cookies, auth headers, IP or request attributes; emails and phone numbers (also percent-encoded) become `[email]` / `[phone]`; fields such as `phone`, `pin`, `otp`, `token` become `[Filtered]`.
- `GET api.namitiszunk.hu/health`: 200 `{"status":"ok"}`, or 503 when `HEALTH_FORCE_FAIL=1`. The MongoDB ping arrives with T-020.
- `POST api.namitiszunk.hu/debug/sentry` with `Authorization: Bearer $SENTRY_TEST_TOKEN` throws a test error; without the token it answers 404.

## One-time setup (owner)

1. **Sentry**: create the organization and one project (platform Next.js). Create an org auth token with `project:releases` and `org:read`.
   - Project → Security & Privacy: turn on "Prevent Storing of IP Addresses" and the Data Scrubber with the default rules plus `$email` and `$phone`.
   - Project → Client Keys: set a rate limit on the DSN key and Allowed Domains (`*.namitiszunk.hu`, the `*.vercel.app` preview domains). Keep Spike Protection on. The DSN is public, so this is what stops quota abuse.
2. **Vercel**, for all five projects:
   - Settings → Environment Variables: turn on "Automatically expose System Environment Variables". Browser events read their environment from `NEXT_PUBLIC_VERCEL_ENV`, and production builds fail without it.
   - Production: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (the same DSN), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
   - Preview: the two DSNs.
   - `namitiszunk-api`: also `SENTRY_TEST_TOKEN` (at least 32 random characters, e.g. `openssl rand -hex 32`), Production only. Rotate it if it ever leaks. `HEALTH_FORCE_FAIL` is refused in production builds.
3. **Better Stack** (Uptime): install the phone app and allow critical alerts.
   - Monitors, every 1 minute, alert after 2 failed checks in a row: `https://api.namitiszunk.hu/health` (expects 200), the order page of the demo venue, `https://admin.namitiszunk.hu`, `https://namitiszunk.hu`. The domains go live with T-005; until then use the `*.vercel.app` URLs.
   - On-call: push and critical alert to the phone, Friday–Saturday 20:00–05:00 escalate with a phone call.
4. **Sentry alert rules**, sent to Better Stack through its Sentry integration (incoming webhook):
   - A new issue in `environment:production`.
   - More than 10 errors in 5 minutes with `app:api`.
5. **Stripe**: Settings → Team and security → notifications: turn on email for failed webhook deliveries.

## Checks (acceptance criteria)

- Test error in production:
  `curl -X POST -H "Authorization: Bearer $SENTRY_TEST_TOKEN" https://api.namitiszunk.hu/debug/sentry`
  The issue must appear in Sentry with the release (git SHA) and a readable TypeScript stack trace.
- Outage alert: set `HEALTH_FORCE_FAIL=1` on a preview of `namitiszunk-api`, point a temporary Better Stack monitor at that preview's `/health`, and expect a push within 3 minutes. Remove the variable afterwards.
- No PII: the test error text contains no email or phone number in Sentry (unit tests in `packages/config/src/sentry.test.ts` cover the masking).

## Tuning

After the first two pilot weekends, raise the thresholds that fired without a real incident, so the pushes stay worth reading.
