# Tasks

Short list of what is being worked on. IDs are T-### where ### = the task number in `docs/fejlesztesi-terv.md`, which holds the full description, acceptance criteria and dependencies (Hungarian). Feature refs F# = docs/PRD.md §05. Tick a box only when AGENTS.md §07 is met.

## Now
- [ ] T-001 Stripe platform account and Connect setup (business, not code)
- [ ] T-005 DNS to Vercel and email sending domain (business, not code)
- [ ] T-003 Legal documents: guest terms (`/[locale]/aszf`) and privacy notice (`/[locale]/adatvedelem`) drafted in hu + en on the landing (`apps/landing/content/legal/`, TSX instead of MDX: no new dependency), the checkout terms box links `/aszf`. Open: the operator's registration and tax numbers (`[később]` / `[to follow]` in the four content files), the lawyer approves (then a dated version and effective date replace `draft-2026-11`); the pilot agreement and the DPA are drafted in `docs/legal/*.docx` (Hungarian, club details and lawyer notes in brackets), PostHog on the processor list goes live with T-018 (confirm it runs without cookies). For the lawyer and the accountant: the 8-year retention of order data (retention counts it from the order's `createdAt`; Sztv. §169 may count from the close of the financial year), the withdrawal exception (45/2014 Korm. rendelet 29. § (1) d)), the no-refund rule for drinks not picked up, and whether Stripe is named as an independent controller.
- [x] T-012 Monorepo scaffold: Turborepo + pnpm, 5 Next.js apps, empty Expo shell, packages
- [x] T-013 CI (GitHub Actions): lint, typecheck, test, build, gitleaks

## Next
- [x] T-014 Environments, secrets and deploy (`packages/config/src/env.ts`, 5 Vercel projects)
- [x] T-015 (F6) Shared i18n package (next-intl, hu + en, formatHuf); follow-up: `formatHuf` check in the mobile app (phase 3)
- [x] T-016 UI base and dark theme (`packages/ui`, tokens.json)
- [x] T-020 Mongoose models and indexes
- [x] T-021 Order state machine
- [x] T-022 Pricing (subtotal, service fee, tip, discount, commission); the 175 Ft minimum is refused in `create-order.ts`, the checkout UI message comes with T-042
- [x] T-023 RBAC permissions; `apps/api/lib/v1-routes.test.ts` fails CI on any route that skips `requirePermission()` without a reviewed reason

## Open decisions
- [x] Guest cancel abuse (from the T-043 review): at a manual-acceptance venue a guest can pay and cancel repeatedly, and each refund leaves the Stripe fee with the venue. Decide whether to cap guest cancels per device or phone per business day. Decided: 1 guest cancel per card (Stripe fingerprint), venue and business day; fails open without a fingerprint; the guest is told to ask the bar.

## Deferred parts
- [x] T-045 "Order more" and "Order again" buttons on the thanks page (built with T-047): "Order again" skips sold-out, archived, VIP-only and changed items and names them.

- [ ] T-048 opening hours have no editor yet: the Admin venue settings task (fejlesztesi-terv.md, venue settings) adds it; until then a script sets `Venue.openingHours`. Moving an order to the right bar (case 8) comes with T-054.

- [ ] T-047 guest account, the parts code cannot prove: Google and Apple sign-in with real credentials, a magic link e-mail through Resend, the signed-in history, export, delete and new sign-in after delete on a phone (e2e covers only the signed-out page; a signed session needs a real Better Auth cookie).

- [ ] T-042 checkout, the parts code cannot prove: a Stripe test-mode run with a real card, 3D Secure and a declined card (`stripe listen`), and Apple Pay / Google Pay on real devices in the closed test (T-008). The terms link is in (T-003); it points at namitiszunk.hu, so it works once the landing is deployed there (T-005).

- [ ] T-049 screen-reader walkthrough on real phones: a full order with VoiceOver (iPhone) and TalkBack (Android) in Stripe test mode, by the checklist in fejlesztesi-terv.md §49.

- [ ] T-049 LCP is a Lighthouse CI warning, not a failure (decision 2026-11-08): the simulated mobile LCP is 3.2–4.5 s and swings 1–2 s between runs, while the observed LCP is under 1.5 s. Make it an error once CI runs hold 2.5 s; cutting hydration JS is the lever.

- [ ] T-049 Web Vitals from real guests (`useReportWebVitals` → PostHog LCP, INP, CLS per venue) comes with T-018 PostHog.

- [ ] T-050 Admin shell, two parts left: the bell's "no receipt entered" orders and links from the bell to the order page come with T-056; turning 2FA on in the club member's profile has no page yet (the sign-in already asks for the code when 2FA is on).
- [ ] T-051 Menu module, parts left: the 40-item menu in under an hour is a manual timing before the pilot; the bartender PIN 403 on the menu is proven in `packages/core` and by the module check, not in e2e (the PIN sign-in screen came with T-054 at `/pin`); a replaced or removed product image stays in Blob (no cleanup yet).
- [ ] T-054 Bar view, parts left (manual): set `NEXT_PUBLIC_API_URL` (https://api.namitiszunk.hu) in the Vercel admin project, or the board's buttons cannot reach the API; the 2 s latency and the sound on a real Ably key with a paid order (T-031 too); the 6-hour Wake Lock run on the pilot tablet and a check on an older iPad (where Wake Lock is missing, auto-lock is switched off in the tablet settings, training covers it). The guest note field on the card is deferred.
- [ ] T-053 Bars and QR codes, parts left: the print and scan test on paper (A4 poster from 1 m, iPhone and Android camera) is manual; the venue colour on the card and poster comes with T-058 (until then black on white with the venue logo); orders by QR source come with T-061 (needs `Order.qrCodeId`).

- [ ] Status audit 2026-11-08 (T-017–T-039, criteria ticked in fejlesztesi-terv.md). Code gaps:
  - T-018 PostHog not built (only `posthogId` in the PaymentIntent metadata; `apps/order/lib/analytics.ts` is a stub).
  - T-030 no real magic-link e2e through a Resend test address.
  - Waiting on Admin: T-026 `impersonatedBy` (T-070), T-031 bar view reconnect and the 2 s latency (T-054), T-032 Payouts page (T-059).
  - Manual (owner): T-017 Sentry/Better Stack production checks (`/health` now answers 503 when MongoDB does not answer the ping), T-019 snapshot restore drill, T-030 Apple/Google sign-in, T-32–34 Stripe Dashboard checks (including the prorated fee on a partial refund), T-037 Gmail/Apple Mail rendering and inbox delivery.

## Later (after these)
- [ ] Remaining v1 tasks in `docs/fejlesztesi-terv.md` sections C–I (#17–#83)

## Done
- [x] T-024 Short order number and business day at payment (`transition()` on `payment_succeeded`, partial unique index `short_number`); run `packages/db/scripts/migrations/2026-11-09-short-number-at-payment.ts` on every database (dev, `namitiszunk_preview`, production) BEFORE that database gets the T-024 code: with the old index the checkout fails on the day's second unpaid order
- [x] T-027 Seed data (status audit 2026-11-08)
- [x] T-029 API skeleton: `/v1` handler, rate limit, idempotency, CORS (status audit 2026-11-08)
- [x] T-035 Background jobs (Inngest) (status audit 2026-11-08)
- [x] T-036 SMS (Twilio); real sending is a manual check (status audit 2026-11-08)
- [x] T-039 Typed API client (status audit 2026-11-08)
- [x] T-042 Checkout and payment (`apps/order/app/[locale]/v/[slug]/checkout`): server-priced quote, tip, SMS phone, 18+ and terms, Stripe Payment Element (deferred intent), one order per double tap; promo field hidden until T-060
- [x] T-040 Guest menu page (`apps/order/app/[locale]/v/[slug]`); JS budget redefined as framework baseline + 50 KB gzip; LCP with images measured in T-049
- [x] T-041 Product sheet and cart (`apps/order/components/product-sheet`, `cart`); item note hidden until T-047
- [x] T-043 Live order status page (`apps/order/app/[locale]/o/[orderId]`); on-device checks (Ready within 2 s, sound, vibration, lock and unlock, motion) still to do on a real phone
- [x] T-044 Payment confirmation, not a receipt (`apps/order/app/[locale]/r/[orderId]`), print and e-mail, 3 per order
- [x] T-045 Thanks page and rating, once per picked-up order; reorder buttons deferred (see above), the Admin reviews list comes with T-064
- [x] T-046 Problem report, 3 per order, mail to the venue and the platform; real Resend delivery not checked yet, the Admin order page shows it with T-056
- [x] T-047 Guest account on `/fiok`: sign-in, history with order again, data export, immediate deletion (`/v1/me/*`); device checks deferred (see above)
- [x] T-048 Guest error states (`apps/order/components/states`, `e2e/states.spec.ts`): venue opening hours and last order (`Venue.openingHours`), live status on checkout, open-order banner, not-live venue page, another payment method, back to the menu from an ended order; hours editing and moving an order to another bar deferred (see above)
- [x] T-049 Performance and accessibility: JS budget on the production build (`e2e/js-budget.perf.ts`, menu 195.7, checkout 192.4, live order 193.9 KB gzip of 196), Lighthouse CI LCP report (`lighthouserc.cjs`), axe and 48 px touch targets on every guest page (`e2e/a11y.spec.ts`), Ably loads after the first paint; LCP enforcement, screen-reader walkthrough and Web Vitals deferred (see above)
- [x] T-050 Admin shell (`apps/admin/app/(dashboard)/layout.tsx`): role-based menu from `adminModules` in `@namitiszunk/core/admin`, a real 403 for module URLs the role may not open (`apps/admin/proxy.ts`, then `requireAdminModule` on every page), the venue-wide Open / Paused switch (`Venue.ordersPausedAt`, audited), venue switcher, notifications bell, `/sign-in`, `e2e/shell.spec.ts` on an in-memory database; profile 2FA and the receipt part of the bell deferred (see above)
- [x] T-051 Menu module (`apps/admin/app/(dashboard)/menu/`): categories and items with drag-and-drop order (dnd-kit, keyboard too), a VIP-only flag per category, item form with hu/en text, integer price, VAT, alcohol %, the 14 EU allergens, bars, image upload to Blob, option groups (copied from another item), duplicate, archive, one-tap sold out, preview at a chosen bar; services in `@namitiszunk/core/menu` (`admin-menu.ts`, audited, raises `Venue.menuVersion`), `e2e/menu.spec.ts`; deferred parts above
- [x] T-052 Menu import from CSV (`apps/admin/app/(dashboard)/menu/import/`): template `apps/admin/public/menu-sablon.csv`, papaparse in `@namitiszunk/core/menu` (`menu-import.ts`) with `;`/`,` detection and BOM, a strict UTF-8 check in the browser, a preview with every problem by line and column, one transaction that creates missing categories and skips same-name items (never overwrites); `csak_vip` sets the category's VIP flag, allergens by hu/en label or code; `e2e/menu-import.spec.ts`
- [x] T-053 Bars, zones, VIP tables and QR codes (`apps/admin/app/(dashboard)/bars/`): bars (name, open, optional max. active orders, a warning only), zones (plain / VIP table) with one QR code each; the code is a fixed short URL (`rendel.namitiszunk.hu/q/[code]`, `apps/order/app/q/[code]/route.ts`) that counts the scan and redirects to the zone's current bar, so a rename or a move never means reprinting; PNG (`qrcode`) and A6 table card / A4 poster PDF (`@react-pdf/renderer`, Inter in `apps/admin/assets/fonts`) with the venue logo; services in `@namitiszunk/core/bars` (audited); `e2e/bars.spec.ts`; deferred parts above
- [x] T-054 Bar view (`apps/admin/app/pult/[barId]/`): a manager or owner sets up the tablet on `/pult`, bartenders sign in by name + PIN on `/pin` (the first tap unlocks the sound and asks for the Wake Lock); a full-screen landscape board with New / In progress / Ready, card age colours, 18+ from `alcoholPercent`, receipt mark logged to the PIN holder, reject with sold-out items (full refund through the api hook), one reminder per order (`Order.reminderSentAt`), move to another bar (the guest page reloads on `update`), pause 5/10/15, active orders against the bar capacity, average prep time, number search, products drawer, rush summary, expired drawer; live through Ably on the bar channel with a full reload on every message and reconnect, polling while the socket is down, offline = red bar and every button off; PWA manifest (fullscreen, landscape); services in `@namitiszunk/core/bar-view`, staff `/v1` routes; `e2e/bar-view.spec.ts` (sign-in, one-tap actions, offline, a second tablet); manual parts above
