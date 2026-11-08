# Security: Na, mit iszunk?

Read before changing auth, payments, data handling, uploads, secrets or deletion. Where this file is stricter than AGENTS.md §05, this file wins. Full review checklist: task #79 (`docs/security/checklist.md`, planned).

## 01 What we protect

| Data | Examples | Sensitivity | Where stored | Retention |
| --- | --- | --- | --- | --- |
| Guest phone numbers | SMS "ready" opt-in | personal data | orders | 30 days, then deleted (Inngest retention job) |
| Guest email on a problem report | optional reply address (T-046) | personal data | orders (`problemReports[].email`) | 90 days, then removed (Inngest retention job, T-028) |
| Card fingerprint | Stripe `card.fingerprint`, caps guest cancels at 1 per card, venue and business day | pseudonymous personal data | payments (`cardFingerprint`, not selected by default) | 2 days, then removed (Inngest retention job) |
| Guest accounts | email, name, order history | personal data | users | until the guest deletes it on `/fiok` (`DELETE /v1/me`, immediate, T-047); inactive accounts after 2 years |
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
- Guest account (`/v1/me/*`, T-047): only an order-app user session (cookie with the order app's `Origin`, or Bearer from the mobile app); staff and admin sessions get 401. Device orders join the account only after the guest confirms (a shared phone may hold someone else's), only with their guest token (hash match, no account yet), never by e-mail; sign-out and deletion clear the orders stored on the device. Export holds every personal field tied to the account. Deletion removes the user, sessions, logins and push tokens in one transaction, keeps the orders for the books without `userId`, and writes an `account.deleted` audit entry without personal data; a venue or platform member gets 409 `staff_account`.
- Guest links (`/o/[orderId]?t=…`, `/r/[orderId]?t=…`) carry the token once: the order app proxy moves it into an httpOnly, secure, sameSite=lax cookie named per order (30 days) and redirects to the URL without it, so the address bar, history and print never show it. Guest pages also send no Referer and are not indexed.
- The confirmation e-mail (T-044) links with the token, so the guest can open it on another device. Accepted risk: a mistyped address gives that person the guest's access to this one order (view, report, rate; no payment or refund). At most 3 such mails per order and 30 per IP per minute.
- Roles: venue roles Owner, Manager, Bartender, VIP host; platform roles Admin, Support, Finance. Every check runs on the server through `packages/core/src/auth/permissions.ts`, with venue ownership checked on every resource.
- Refunds after hand-over: Manager or Owner only. Impersonation from HQ is read-only by default and always audit-logged.
- Refund status gate (`refundOrder`, read inside the transaction): staff refund only Picked up or Expired orders; a Cancelled order that was paid after the timeout only HQ Support or Admin with the write confirmation, or the system (automatic late-payment refund). The system also refunds Rejected and Expired orders. Anything else is 409 `refund_not_allowed_in_status`. A Manager's limit applies to the sum of the Manager refunds on the order (pending and succeeded), not to each refund.
- Refund outcome: only a definitive Stripe rejection (4xx other than 429) marks a Refund failed. A timeout, network error or 5xx leaves it pending (it counts as refunded, so nothing can be refunded twice) and it is resent with the same idempotency key (the Refund id) by a retry with the same Idempotency-Key (the Refund stores its hash as `requestKey`) or by the system refund job, within Stripe's 24-hour key window. Refund webhooks act on the refund as Stripe returns it now, not on the event snapshot; a Stripe refund without our `refundId` (made in the Dashboard) is reported.
- A PaymentIntent counts as paid only when amount, currency, application fee and connected account all match the Payment.
- Rate limits: sign-in, email link / OTP, PIN entry, payment intent creation, demo form.
- Better Auth hardening (packages/auth): a session is refused outside the app that created it (cookie or Bearer); a session that skipped TOTP may only verify, read itself or sign out; TOTP checks are limited per user (5 per 5 minutes, then a 15 minute lock) on top of the IP limit; e-mail links are limited per address and stored hashed; `/list-sessions` is disabled (it returns session tokens); Bearer tokens must be signed. PIN attempts are counted before the check, PINs unlock only Bartender and VIP host, and an unknown member costs the same argon2 check.

## 04 Secrets

- Stored in: Vercel env (production, preview) and `.env.local` (development). Never in git, never in `NEXT_PUBLIC_*` (except publishable keys and DSNs), never in logs.
- A production build fails if `STRIPE_SECRET_KEY` starts with `sk_test_`; development and preview never get live keys.
- One database user per environment, strong random password, least privilege.
- CI runs gitleaks; a leaked secret: rotate first, then clean the history.

## 05 Input, output, injection

- MongoDB: never pass request objects into queries; reject `$`-prefixed keys from user input; validate ObjectIds.
- Amounts, prices, fees and the commission are always computed on the server from database values.
- No `dangerouslySetInnerHTML` without sanitization (menu descriptions are plain text).
- Uploads (Vercel Blob): images only (jpeg, png, webp), max 5 MB, enforced in a short-lived client token from `POST /v1/uploads` (T-038). Product images need `menu.edit` (Manager, Owner); logo and cover need `venue.editSettings` (Owner, HQ admin with a confirmed write). The server fixes the path `venues/{venueId}/{kind}/{uuid}` (kind `product` or `venue`); `deleteBlob` (@namitiszunk/core/uploads) deletes only URLs on the Blob public host under that venue and kind, so the delete needs the same permission as the upload.

## 06 Dependencies

- New dependency → ask first. CI fails on `pnpm audit --prod` high or critical (planned, #13).
- External pentest before the public launch.

## 07 Incident basics

- Contact: Tamás Krisztián Kálmán (platform owner). Critical window: Friday–Saturday 20:00–05:00; alerts via Sentry + uptime to phone.
- A leaked secret: rotate first, then clean the history. A data incident involving personal data: GDPR 72-hour notification assessment.
