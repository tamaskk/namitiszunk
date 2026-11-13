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
| QR codes / print | `qrcode`, `@react-pdf/renderer` (Admin only, T-053) | PNG and a real PDF table card / A4 poster rendered on the server; no headless browser to run on Vercel |
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
    core/                   business logic: orders (state machine), pricing, payments, auth/permissions, audit, notify, realtime, reports (aggregations reused by the weekly e-mail and the dashboard)
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
- Refunded: `refundOrder` never transitions. The refund webhook does, once the Refunds of the Payment have succeeded in full, as the actor who started the last refund (`Refund.initiatedBy` keeps the ids and role needed to rebuild it); system refunds use the Stripe system actor. It runs after the event is claimed and reads the stored state, so a failed transition makes Stripe redeliver and the redelivery finishes it. A payment that succeeds after the timeout cancelled the order is refunded in full automatically (reason `late_payment`); the order stays Cancelled.
- After the commit, `transition()` runs the Ably publish and every hook registered with `onStatusChanged()` (the Inngest `order/status.changed` emit) side by side. A failing hook never fails the call, since the change is committed: each failure goes once to the caller's `reportError`, else to the reporter set with `setDefaultErrorReporter()` (Sentry), else the console. Any app process that calls `transition()` must register its hooks and reporter at startup: apps/api does in `instrumentation.ts`; admin and order do not call `transition()` today, and must register the same hooks when they start to.

State:
- Server state lives in MongoDB; the bar view keeps a local list and resyncs after a network drop.
- Client state is UI only (cart draft, open sheets). Prices and totals are always recomputed on the server.
- Optimistic updates: none in v1 for money or order status.

Auth:
- Sessions are checked at the route or action. Services receive an actor (user id + role + venue) and never read the session themselves.
- Guests use a per-order guest token; staff on the bar view use a PIN on a signed-in device.
- `packages/auth` builds the actor: `userActorFromRequest(app, request)`, `staffActorFromRequest`, `guestActorFromToken`. Request data never yields a `system` actor; a platform role comes only from an active PlatformMember in a 2FA-verified HQ session.
- order, admin and hq each run their own Better Auth instance (`/api/auth/[...all]`) with their own cookie names (`nmi-<app>.*`); every session records the app that created it and is refused by the others. Venue memberships count only in admin, the platform role only in HQ.
- In production the cookies are set on `.namitiszunk.hu` (derived from `BETTER_AUTH_URL`, no extra variable), so `api.namitiszunk.hu` receives them; on localhost and Vercel previews they stay host-only, so browser calls to the API carry no session there. apps/api (`lib/session-actor.ts`) picks the cookie by the request `Origin`: only an allowlisted origin of order, admin or hq counts, and only that app's session (an admin session never counts for an HQ request). A request without an allowlisted `Origin` never gets a cookie session, which is the CSRF check for state-changing calls; CORS sends `Access-Control-Allow-Credentials` only to allowlisted origins. The mobile app (no `Origin`) authenticates with an order-app Bearer token (Better Auth `bearer()`), never a cookie. On admin, a staff PIN session (`nmi-device` + `nmi-staff`) counts when no user is signed in; the code that sets those cookies must use the same parent domain.
- Admin pages (T-050): `adminModules` in `@namitiszunk/core/admin` maps each module to the permission-matrix action that opens it; the menu and the checks read the same map. `apps/admin/proxy.ts` refuses a module URL the role may not open with a real 403 before rendering (it fetches `/forbidden` from `BETTER_AUTH_URL`, never the request Host, and forwards only the locale cookie) (in production a page streams its shell before `forbidden()` runs, so the status would stay 200); every page and server action checks again (`requireAdminModule`, `getAdminContext`). The current venue comes from the `nmi-admin.venue` cookie, checked against the member's own memberships. The venue-wide pause is `Venue.ordersPausedAt` (no time limit; guest status and order creation both read it), guarded by `venue.pauseOrders` (manager, owner) and separate from the per-bar `Bar.pausedUntil` (`bar.pauseOrders`, bartenders too).
- Bar view (T-054): the services live in `@namitiszunk/core/bar-view` (`summary.ts` is client-safe: rush summary and card age). Every status-changing staff action (status, reject, reminder) goes through `/v1` on the api, never a server action in the Admin, because only apps/api registers the Inngest hook that refunds a rejection and starts the timers, and only it has the notify deps; the Admin browser calls the api with `credentials: "include"` and the parent-domain staff cookies. Changes that are not status changes (receipt mark, move, pause) publish `update` on the bar channels (and the order channel for a move) through `publishBarUpdate`. A manager or owner registers the tablet on `/pult` (`createDeviceSession`, device cookie plus the bar cookie); bartenders then pick their name and enter the PIN on `/pin`, which sits outside the module paths so the proxy can send a PIN-less device there. The board (`apps/admin/app/pult/[barId]/`) never patches its list from a message: any message on the bar channel, any reconnect and, while the socket is down, a 5 s poll reload the whole list from `/v1/bars/{id}/orders`; a failed reload is the offline state (read-only, every button off). Sound (Web Audio, generated) and the Wake Lock live in `apps/admin/lib/tablet-alerts.ts` for the VIP view too. The VIP host's phone (T-055, `apps/admin/app/vip/`) is the same pattern on `vipChannel`: the live list hook (`apps/admin/lib/use-live-list.ts`, Ably in `tablet-live.ts`) is shared by both views, and a device registered without a bar is a VIP phone (the PIN sign-in sends a VIP host to `/vip`, everyone else to `/pult`). A pickup reminder is sent once per order: `sendPickupReminder` claims `Order.reminderSentAt` atomically, for both the timer and the bar button.
- Orders module (T-056): `@namitiszunk/core/orders/admin` only reads (list, one order, export) and is guarded by `order.viewHistory` (Manager, Owner). Server components call it directly; the export is an admin route handler (`/orders/export`) because it is a file download, not a state change. Refund and cancel go from the browser to `/v1/orders/{id}/refunds` and `/v1/orders/{id}/reject`, like the bar view, so the refund hook and the audit stay in apps/api. The timeline is the order's and its refunds' audit entries, with names looked up when the page renders.
- Staff module (T-057): `@namitiszunk/core/staff` (list, add PIN member, change PIN, enable or disable, member log, revoke device) runs every write in a transaction with its audit entry and reuses `staff.invite` with the target role as the permission. Core hashes and checks PINs itself (`@node-rs/argon2`, the same library as `packages/auth`), because `packages/auth` depends on core, not the other way. Invites stay in `packages/auth/src/invites.ts` (Better Auth verification store); the Admin calls them from a server action. `StaffDevice` (packages/db, people.ts) backs the signed device cookie: `createDeviceSession` writes it, `packages/auth` refuses a cookie without an active record, and a TTL index drops it when the cookie would expire.
- Payouts (T-059): `@namitiszunk/core/payments` `getPayoutAccount` checks `payout.manage` and reads the account id from our database; `fetchPayoutOverview` then reads Stripe on that account and has no check of its own, so it is only called with an id `getPayoutAccount` returned. The Admin page wraps it in `"use cache"` (`payouts/overview.ts`, 5 minutes, tag `payouts:<venueId>`); the frequency change and "Frissítés" drop it with `updateTag`. CSV and Excel files for both exports come from `@namitiszunk/core/export/table-file` (BOM, `;`, formula neutralizing), and the Admin's from–to form is `components/export-range.tsx`.
- Promotions (T-060): `@namitiszunk/core/promos` holds `validatePromo` and `checkPromo` (the same check behind the guess limiter, shared by the quote and createOrder through `priceCart`; apps/api passes the client IP, the checkout its `deviceId`) and the Owner's module (list with statistics, create, stop or restart, each write in a transaction with its audit entry). The order keeps `promoId` and `discountHuf` as its snapshot; createOrder takes no use. `transition()` takes it on `payment_succeeded` (`takePromoUse`) and gives it back on the guest's own `reject` of a paid order, both in the status change's transaction, so an unpaid order never holds a use. A bar rejection or an expired order keeps its use (the code did its job). Paying at the same moment for the last use may overshoot `maxUses` (decision 2026-11-14). A promo that makes an order free or below Stripe's minimum is refused, because a free order has no payment webhook to move it to New. The statistics read paid orders through the partial index `promo_orders` on Order `{ promoId }`. The promo rate limits count in wall-clock windows (`hitRateLimit`), never in the pricing `now`.
- Settings (T-058): `@namitiszunk/core/settings` saves one tab at a time in a transaction with its audit entry and `bumpMenuVersion`, so the order app's cached menu, accent and tip buttons change on the next load (the live status endpoint reads opening hours fresh). The guest pages override `--color-primary` (and a darker hover) inline on the page root with the venue accent, but only when `accentIsReadable` (`@namitiszunk/core/settings/contrast`, pure, also used by the Admin form for the live warning) passes 4.5:1 on `--color-surface`. Tip presets live per venue; `@namitiszunk/validators` only bounds a percent tip to 0–100%, and `calculateOrder` checks it against the venue's presets (`TIP_PERCENT_BPS` stays the default). Image upload for menu items and the venue logo or cover share `apps/admin/lib/upload-image.ts`; a new logo or cover must be a Blob URL issued for the venue (`isVenueBlobUrl`), and the replaced one is deleted after the save (best effort).
- Menu editing (T-051): every Admin menu change runs in `@namitiszunk/core/menu` (`admin-menu.ts`) in one transaction with its audit entry and `$inc Venue.menuVersion`. The order app's `"use cache"` menu takes `menuVersion` as part of its cache key, so the next guest load after a save reads fresh data; the admin cannot call `revalidateTag` in the order app's Vercel project, so the plan's `revalidateTag('menu:{venueId}')` became this version key. `Category.vipOnly` is the owner's switch; core mirrors it onto each `Item.vipOnly`, so create-order, cart validation and the public menu keep checking the item. In the Admin, an active staff PIN on the device makes the PIN holder the actor (`getAdminContext`), so a bartender's PIN gets 403 on menu edits but may mark an item sold out (`product.setSoldOut`). A new product image must be a Blob URL issued for the venue (`isVenueBlobUrl`). Rule for later writers: anything that changes what a guest sees on the menu (sold out in the bar view, bar or zone edits, scheduled price rules) calls `bumpMenuVersion` from `@namitiszunk/core/menu` in its transaction, or guests keep the cached menu. Exception to "third-party SDKs only in packages/core": the browser upload uses `put` from `@vercel/blob/client` in the Admin item form, because the file goes straight from the browser to Blob; the token, path, type and size limits still come from core through `/v1/uploads`. Menu CSV import (T-052): the browser only decodes the file (strict UTF-8, so a Windows-1250 Excel save is refused, not garbled); parsing (papaparse), validation and the plan run in `@namitiszunk/core/menu` for both the preview and the import, and the import re-reads the file instead of trusting the preview.
- 2FA (TOTP) is enforced by us, not only by the plugin: OAuth and e-mail link sign-ins skip the plugin's challenge, so a session is marked `twoFactorVerified` only by a TOTP or backup-code check. HQ requires it; venue users once they turn 2FA on.
- Staff device and PIN sessions are HMAC-signed cookies (`nmi-device`, 30 days; `nmi-staff`, 8 hours); invites are hashed one-time tokens in Better Auth's `verification` collection (no extra collection).

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
- The Stripe webhook lives at `apps/api/app/webhooks/stripe`, outside `/v1` and outside `handler()`: Stripe authenticates with the signature on the raw body, not a session, and its retries plus the `stripeEvents` unique event id replace rate limits and idempotency keys. With direct charges every event arrives on this one Connect endpoint, signed with `STRIPE_WEBHOOK_SECRET`.
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
| BETTER_AUTH_SECRET | packages/auth (sessions, staff device and PIN cookies) | yes |
| BETTER_AUTH_URL | packages/auth; each of apps/order, admin, hq sets its own URL (separate sessions per app) | yes |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | packages/auth Google sign-in (order, admin, hq) | yes |
| APPLE_CLIENT_ID, APPLE_CLIENT_SECRET | packages/auth Apple sign-in: Services ID and the client secret JWT (renew within 6 months) | yes |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | packages/core payments, apps/api webhooks | yes |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | apps/order checkout | no |
| PLATFORM_ALERT_EMAIL | apps/api: the platform copy of guest problem reports (T-046) | no |
| NEXT_PUBLIC_API_URL | apps/order browser: order status, guest cancel and the Ably token through apps/api; apps/admin browser: menu image upload token (T-051) | no |
| ABLY_API_KEY | packages/core realtime, token route | yes |
| TWILIO_* | packages/core notify | yes |
| RESEND_API_KEY | packages/emails (apps/api; apps/order, admin, hq for the sign-in e-mail link) | yes |
| BLOB_READ_WRITE_TOKEN | apps/api uploads; apps/admin: a saved product image must be in this store (T-051) | yes |
| INNGEST_* | apps/api inngest | yes |
| SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN | all apps (server, browser); one Sentry project per app (`namitiszunk-<app>`), events also tagged `app` | no (DSN is public) |
| SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT | next.config of every app (source map upload, production builds only) | token: yes |
| SENTRY_TEST_TOKEN | apps/api `POST /debug/sentry` (unset = 404; replaced by the HQ Admin role in T-030) | yes |
| HEALTH_FORCE_FAIL | apps/api `/health`, preview only: `1` answers 503 to test the uptime alert | no |
| NEXT_PUBLIC_POSTHOG_KEY | packages/analytics | no |
