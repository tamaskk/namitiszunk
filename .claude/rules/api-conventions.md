---
paths:
  - "apps/api/**"
  - "apps/*/app/**/route.ts"
  - "apps/*/app/**/actions.ts"
  - "packages/core/**"
  - "packages/validators/**"
  - "packages/auth/**"
  - "packages/api-client/**"
---

# API, server actions and services

- Route handlers and server actions are thin: authenticate, validate the input with a schema from `@namitiszunk/validators`, call one `@namitiszunk/core` service, map the result to a response.
- Authorization happens at the entry point (session + venue ownership) and again in the service via `packages/core/src/auth/permissions.ts`. Services receive an actor; they never read the session or the request.
- Never trust client-supplied ids for ownership, or client-supplied prices, totals, fees, roles or venue ids. Load them on the server.
- Order status changes only through `packages/core/src/orders/transition.ts`, which validates the transition, writes the audit log and publishes the Ably event.
- Response shape: success `{ data }`, error `{ error: { code, messageKey, fields } }` (`messageKey` is an i18n key, `fields` maps input paths to keys) with the matching HTTP status (400, 401, 403, 404, 409, 429, 500). Every `/v1` route goes through `handler()` in `apps/api/lib/handler.ts` with explicit `auth` and `permission` (`"public"` / `"none"` for public routes). Never return stack traces or Stripe/Twilio error text.
- Report unexpected errors to Sentry once, with a request id. The client gets a generic message key.
- Stripe webhooks: verify the signature on the raw body before parsing; handlers are idempotent (store processed event ids); a PaymentIntent is created with an idempotency key.
- Public endpoints (order creation, payment, sign-in, OTP, PIN, demo form) are rate limited.
- API routes are versioned under `apps/api/app/v1/`; every schema change updates the OpenAPI output and `packages/api-client`.
- Third-party SDKs are called only from `packages/core`, never from components or pages.
