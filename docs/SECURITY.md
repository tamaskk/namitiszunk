# Security: Na, mit iszunk?

Read before changing auth, payments, data handling, uploads, secrets or deletion. Where this file is stricter than AGENTS.md §05, this file wins. Full review checklist: task #79 (`docs/security/checklist.md`, planned).

## 01 What we protect

| Data | Examples | Sensitivity | Where stored | Retention |
| --- | --- | --- | --- | --- |
| Guest phone numbers | SMS "ready" opt-in | personal data | orders | 30 days, then deleted (Inngest retention job) |
| Guest accounts | email, name, order history | personal data | users | until deletion; inactive accounts after 2 years |
| Staff | name, PIN hash, email (Manager/Owner) | personal data, credentials | staff / users | while employed at the venue |
| Orders and payments | items, amounts, Stripe ids | financial | orders | per accounting rules (confirm with the accountant) |
| Venue payout data | Stripe connected account | financial | Stripe only; we store the account id | while the venue is active |
| Audit log | refunds, fee changes, impersonation | integrity | audit | never deleted in v1 |

Card data never touches our servers: Stripe Elements / Payment Request and PaymentSheet only.

## 02 Trust boundaries

- Browser and mobile → API: untrusted. Validate with the shared Zod schema at the route handler or server action.
- Stripe webhooks: verify the signature on the raw body before parsing; handlers are idempotent (store processed event ids).
- Ably: clients get short-lived tokens from `apps/api/app/v1/realtime/token`, scoped to one venue/bar or one order.
- Third-party responses (Stripe, Twilio, Resend): untrusted input.

## 03 Authentication and authorization

- Provider: Better Auth. Session cookie httpOnly, secure, sameSite=lax, per-app names on the `.namitiszunk.hu` parent domain in production; apps/api accepts a cookie only with an allowlisted `Origin` of the app that owns it (CSRF check), the mobile app uses a Bearer token. Sign-in: Apple, Google, email link.
- HQ requires 2FA for every platform role. Staff on the bar view use a PIN on a device signed in by a Manager.
- Guests access their order with a per-order guest token, never with a guessable order id.
- Roles: venue roles Owner, Manager, Bartender, VIP host; platform roles Admin, Support, Finance. Every check runs on the server through `packages/core/src/auth/permissions.ts`, with venue ownership checked on every resource.
- Refunds after hand-over: Manager or Owner only. Impersonation from HQ is read-only by default and always audit-logged.
- Rate limits: sign-in, email link / OTP, PIN entry, payment intent creation, demo form.

## 04 Secrets

- Stored in: Vercel env (production, preview) and `.env.local` (development). Never in git, never in `NEXT_PUBLIC_*` (except publishable keys and DSNs), never in logs.
- A production build fails if `STRIPE_SECRET_KEY` starts with `sk_test_`; development and preview never get live keys.
- One database user per environment, strong random password, least privilege.
- CI runs gitleaks; a leaked secret: rotate first, then clean the history.

## 05 Input, output, injection

- MongoDB: never pass request objects into queries; reject `$`-prefixed keys from user input; validate ObjectIds.
- Amounts, prices, fees and the commission are always computed on the server from database values.
- No `dangerouslySetInnerHTML` without sanitization (menu descriptions are plain text).
- Uploads (Vercel Blob): images only (jpeg, png, webp), max 5 MB, enforced in a short-lived client token from `POST /v1/uploads` (T-038). Product images need `menu.edit` (Manager, Owner); logo and cover need `venue.editSettings` (Owner, HQ admin with a confirmed write). The server fixes the path `venues/{venueId}/{uuid}`; `deleteBlob` (@namitiszunk/core/uploads) deletes only URLs on the Blob public host under that venue's folder.

## 06 Dependencies

- New dependency → ask first. CI fails on `pnpm audit --prod` high or critical (planned, #13).
- External pentest before the public launch.

## 07 Incident basics

- Contact: Tamás Krisztián Kálmán (platform owner). Critical window: Friday–Saturday 20:00–05:00; alerts via Sentry + uptime to phone.
- A leaked secret: rotate first, then clean the history. A data incident involving personal data: GDPR 72-hour notification assessment.
