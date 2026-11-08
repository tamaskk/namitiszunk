# Tasks

Short list of what is being worked on. IDs are T-### where ### = the task number in `docs/fejlesztesi-terv.md`, which holds the full description, acceptance criteria and dependencies (Hungarian). Feature refs F# = docs/PRD.md §05. Tick a box only when AGENTS.md §07 is met.

## Now
- [ ] T-001 Stripe platform account and Connect setup (business, not code)
- [ ] T-005 DNS to Vercel and email sending domain (business, not code)
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

- [ ] T-042 checkout, the parts code cannot prove: a Stripe test-mode run with a real card, 3D Secure and a declined card (`stripe listen`), the terms link (T-003), and Apple Pay / Google Pay on real devices in the closed test (T-008).

## Later (after these)
- [ ] Remaining v1 tasks in `docs/fejlesztesi-terv.md` sections C–I (#17–#83)

## Done
- [x] T-042 Checkout and payment (`apps/order/app/[locale]/v/[slug]/checkout`): server-priced quote, tip, SMS phone, 18+ and terms, Stripe Payment Element (deferred intent), one order per double tap; promo field hidden until T-060
- [x] T-040 Guest menu page (`apps/order/app/[locale]/v/[slug]`); JS budget redefined as framework baseline + 50 KB gzip; LCP with images measured in T-049
- [x] T-041 Product sheet and cart (`apps/order/components/product-sheet`, `cart`); item note hidden until T-047
- [x] T-043 Live order status page (`apps/order/app/[locale]/o/[orderId]`); on-device checks (Ready within 2 s, sound, vibration, lock and unlock, motion) still to do on a real phone
- [x] T-044 Payment confirmation, not a receipt (`apps/order/app/[locale]/r/[orderId]`), print and e-mail, 3 per order
- [x] T-045 Thanks page and rating, once per picked-up order; reorder buttons deferred (see above), the Admin reviews list comes with T-064
- [x] T-046 Problem report, 3 per order, mail to the venue and the platform; real Resend delivery not checked yet, the Admin order page shows it with T-056
- [x] T-047 Guest account on `/fiok`: sign-in, history with order again, data export, immediate deletion (`/v1/me/*`); device checks deferred (see above)
- [x] T-048 Guest error states (`apps/order/components/states`, `e2e/states.spec.ts`): venue opening hours and last order (`Venue.openingHours`), live status on checkout, open-order banner, not-live venue page, another payment method, back to the menu from an ended order; hours editing and moving an order to another bar deferred (see above)
