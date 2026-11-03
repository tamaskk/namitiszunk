# Architecture: Na, mit iszunk?

Status: target architecture. The repo has no application code yet; the monorepo is scaffolded in task #12 of `docs/fejlesztesi-terv.md`. Everything below is "Target (not yet true)" until that task lands. Update this file in the same commit as any structural change.

## 01 System overview

```
Guest phone (browser)   Bar tablet (PWA)   Owner/Manager   Platform team   Prospect   Mobile app (phase 3)
        |                     |                  |               |              |              |
        v                     v                  v               v              v              |
  apps/order            apps/admin (incl. bar view)         apps/hq      apps/landing          |
  rendel.namitiszunk.hu admin.namitiszunk.hu                hq.…         namitiszunk.hu        |
        |                     |                  |               |              |              |
        +---------------------+------------------+---------------+--------------+--------------+
                                              |
                                              v
                      apps/api  (api.namitiszunk.hu, Next.js route handlers)
                      business logic in packages/core, data in packages/db
                                              |
   +-------------+----------+---------+---------+---------+----------+-----------+----------+
   v             v          v         v         v         v          v           v          v
MongoDB Atlas  Stripe     Ably     Inngest   Twilio    Resend    Vercel Blob   Sentry    PostHog
(Frankfurt)   Connect   realtime   jobs       SMS       email     images      errors   analytics
```

- Web apps may render server-side and call `packages/core` services directly from server code; the mobile app, webhooks and background jobs go through `apps/api`.
- Clients never talk to MongoDB or third-party APIs with secret keys. Keys stay on the server.
- An order reaches the bar only after the Stripe webhook confirms payment; the bar view subscribes through Ably.

## 02 Tech stack

| Layer | Choice | Why this, not the obvious alternative |
| --- | --- | --- |
| Monorepo | Turborepo + pnpm 10, Node 24 LTS (`.nvmrc`) | Five web apps and a mobile app share domain code; turbo caches and runs only changed packages |
| Web apps | Next.js App Router, React, TypeScript strict | One framework for landing, order, admin, HQ and API |
| Backend | `apps/api` with Next.js route handlers (v1 REST, OpenAPI) | One deployable API for mobile, webhooks and jobs; no separate NestJS service to run |
| Styling | Tailwind v4 (web), NativeWind 4 / Tailwind v3 (mobile); tokens from `packages/ui/tokens.json` | Shared tokens instead of a shared config, because the Tailwind versions differ |
| UI primitives | shadcn/ui in `packages/ui` | Accessible primitives, restyled once for all four web apps |
| Mobile | Expo + Expo Router (phase 3; empty shell in #12) | Native Apple Pay / push / camera without a second codebase language |
| Database | MongoDB Atlas (M0 dev, Flex prod, Frankfurt) | Decided in the product document; document-shaped orders with item snapshots |
| Queries | Mongoose | Schemas, indexes and middleware in one place (`packages/db`) |
| Validation | Zod in `packages/validators`, OpenAPI generated from it | One schema on client, server and mobile |
| Auth | Better Auth (Apple, Google, email link, HQ 2FA, staff PIN, guest token) | Covers every login type we need; Auth.js and Clerk do not cover PIN + guest token cleanly |
| Payments | Stripe Connect, direct charges + application fee | Money goes straight to the venue; Stripe fees, refunds and chargebacks hit the venue account |
| Realtime | Ably | Orders on the bar screen within 2 s without running our own websocket server on Vercel |
| Background jobs | Inngest | Expiry, reminders, abandoned payments, weekly report, data retention |
| SMS / Email | Twilio / Resend + React Email | "Ready" SMS without an app; transactional email with SPF/DKIM |
| Files | Vercel Blob | Product images, logos |
| i18n | next-intl (web), use-intl (mobile), shared `packages/i18n` | hu + en from day one, one set of message files |
| Hosting | Vercel Pro, 5 projects, region `fra1` | Next.js native hosting next to the Frankfurt database |
| Monitoring / analytics | Sentry, uptime monitor, PostHog (cookieless) | Night-time alerts; funnel measurement without a cookie banner |
| Testing | Vitest (web, packages), Jest (mobile), Playwright (e2e), Maestro (mobile e2e), k6 (load) | Matches each runtime; the money paths get unit and e2e coverage |

Do not add a dependency that overlaps with a row in this table without asking.

## 03 Project structure

```
/
  AGENTS.md, CLAUDE.md      agent instructions
  docs/                     PRD, design system, this file, security, tasks, fejlesztesi-terv.md
  apps/
    landing/                namitiszunk.hu, port 3000
    order/                  rendel.namitiszunk.hu, port 3001 (guest ordering, [locale] routes)
    admin/                  admin.namitiszunk.hu, port 3002 (club admin + bar view PWA at app/pult/)
    hq/                     hq.namitiszunk.hu, port 3003 (platform admin, 2FA)
    api/                    api.namitiszunk.hu, port 3004 (app/v1/, app/webhooks/, src/inngest/)
    mobile/                 Expo app (phase 3)
  packages/
    core/                   business logic: orders (state machine), pricing, payments, auth/permissions, audit, notify, realtime
    db/                     Mongoose connection, models, indexes, queries, seed
    validators/             Zod schemas shared by every client and the API
    api-client/             typed client for apps/api (mobile, client-side web calls)
    auth/                   Better Auth configuration
    ui/                     shadcn primitives + tokens.json
    i18n/                   hu.json, en.json, formatters (formatHuf, dates)
    emails/                 React Email templates
    analytics/              PostHog wrapper
    config/                 env schemas (Zod), tailwind, eslint, tsconfig presets
  e2e/                      Playwright tests
  load/                     k6 scripts
```

Every package exports TypeScript source from `src/index.ts`, named `@namitiszunk/<name>`; Next apps compile them with `transpilePackages`.

Where new code belongs:
- A new page: `apps/<app>/app/.../page.tsx`. Thin: it calls a `packages/core` service or the API.
- New business logic: `packages/core/src/<domain>/`.
- A new third-party call: `packages/core/src/<domain>/` behind a small integration module (e.g. `notify/sms.ts`), never from a component.
- A new API endpoint: `apps/api/app/v1/<resource>/route.ts`, input schema in `packages/validators`.
- A new UI primitive: `packages/ui/src/`, added to DESIGN_SYSTEM.md §06 in the same commit.
- A new model or index: `packages/db/src/models/` (needs approval, §08).

## 04 Data flow

Request path for every write:
1. User action in a component (or a mobile screen).
2. Route handler or server action authenticates, then validates input with the shared Zod schema.
3. A `packages/core` service checks permissions (RBAC) and applies the business rule.
4. `packages/db` queries touch MongoDB.
5. A typed response returns; the UI updates from the response or a realtime event, not from a guess.

Order lifecycle:
- Created as Awaiting payment (not visible to the bar) → Stripe webhook `payment_intent.succeeded` → New → In progress → Ready → Picked up. Side branches: Rejected (only from New, whole order, full refund), Expired, Refunded, Payment failed.
- Every transition goes through one server function (`packages/core/src/orders/transition.ts`) that checks the allowed transition, writes the audit log and publishes an Ably event.

State:
- Server state lives in MongoDB; the bar view keeps a local list and resyncs after a network drop.
- Client state is UI only (cart draft, open sheets). Prices and totals are always recomputed on the server.
- Optimistic updates: none in v1 for money or order status.

Auth:
- Sessions are checked at the route or action. Services receive an actor (user id + role + venue) and never read the session themselves.
- Guests use a per-order guest token; staff on the bar view use a PIN on a signed-in device.

Errors:
- Validation errors return to the form with a message.
- Unexpected errors go to Sentry with a request id and show a generic message. Never show stack traces or Stripe error text to the user.

## 05 Boundaries

Dependencies flow one way: `apps/*` → `packages/core` → `packages/db` + integrations. `packages/validators`, `packages/i18n`, `packages/ui` and `packages/config` are leaf packages.

Allowed:
- Apps import `core`, `validators`, `ui`, `i18n`, `api-client`, `auth`, `analytics`.
- `core` imports `db`, `validators` and third-party SDKs.

Never:
- Components or pages import `packages/db` or a third-party SDK with a secret key.
- `packages/core` or `packages/db` import from `apps/*`, `ui` or React.
- `apps/mobile` imports `core` or `db` server code; it uses `api-client`.
- One app imports another app.
- Anything in a client bundle reads a secret. Server-only modules import `server-only`.

## 06 Decisions that look wrong but are intentional

The agent must not "fix" these.

- Money is stored as integers (HUF forints), never floats. Stripe's HUF decimal rules are handled at the Stripe boundary only.
- Order items store a snapshot of name, price and options, so later menu edits never rewrite past orders.
- The short order number restarts per venue every business day (e.g. at 06:00), so two orders can share a number across days.
- Order status changes only through the single transition function; no direct `status` updates anywhere else, even in scripts.
- Menu items are archived, never hard-deleted.
- The bar never sees Awaiting payment orders; an order exists for the bar only after the webhook.
- Direct charges on the venue's connected account: Stripe fees, refunds and chargebacks are the venue's, the platform only takes the application fee. Guests pay no platform fee.
- The confirmation page deliberately does not look like a receipt; fiscal receipts come from the club's own till.
- The Atlas network allowlist is `0.0.0.0/0` because Vercel functions have no fixed IPs; compensated by strong per-environment database users with minimal roles.
- Tokens live in `tokens.json`, not in a shared Tailwind config (web Tailwind v4, mobile Tailwind v3).

## 07 Scalability and future considerations

- Expected scale for v1: one pilot club, one bar, under 300 guests per night. Vercel + Atlas Flex is enough; build for this.
- Later target: 50 orders per minute per venue at peak, 50 concurrent venues (load-tested in staging before go-live).
- Known limits: Atlas Flex has no point-in-time recovery (daily snapshot only) until the move to M10 (#116); no fixed outbound IP.
- Planned next: multi-bar UI, mobile app, push, POS integration (Fruitsys), automatic invoicing (Számlázz.hu).
- Not planned: multi-currency, native tablet app for the bar, self-service venue sign-up in v1 (HQ creates venues).

## 08 When the agent must stop and ask

Stop, name the conflict and propose the smallest change that avoids it when a task needs:
- Crossing a boundary in §05.
- Changing a decision in §06.
- A new collection, index, dependency or third-party service.
- Any change to auth, RBAC, payments, refunds, fees or the order state machine.

## 09 Environments and configuration

| Environment | URL | Deployed from | Data |
| --- | --- | --- | --- |
| Local | http://localhost:3000–3004 | your machine | Atlas M0 (dev), Stripe test keys, `stripe listen --forward-to localhost:3004/webhooks/stripe` |
| Preview | per-PR Vercel URLs | pull requests | Atlas M0, database `namitiszunk_preview`, Stripe test keys, no webhook |
| Production | https://namitiszunk.hu and subdomains | main | Atlas Flex, live keys, live webhook |

Environment variables (names only; values live in Vercel and `.env.local`), validated by Zod in `packages/config/src/env.ts`; a production build fails on an `sk_test_` key:

| Name | Used by | Server-only |
| --- | --- | --- |
| MONGODB_URI | packages/db | yes |
| BETTER_AUTH_SECRET | packages/auth | yes |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | packages/core payments, apps/api webhooks | yes |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | apps/order checkout | no |
| ABLY_API_KEY | packages/core realtime, token route | yes |
| TWILIO_* | packages/core notify | yes |
| RESEND_API_KEY | packages/emails | yes |
| BLOB_READ_WRITE_TOKEN | apps/api uploads | yes |
| INNGEST_* | apps/api inngest | yes |
| SENTRY_DSN | all apps | no (DSN is public) |
| NEXT_PUBLIC_POSTHOG_KEY | packages/analytics | no |
