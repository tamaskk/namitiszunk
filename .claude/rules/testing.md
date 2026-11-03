---
paths:
  - "**/*.test.{ts,tsx}"
  - "**/*.spec.{ts,tsx}"
  - "e2e/**"
  - "load/**"
  - "apps/mobile/.maestro/**"
  - "**/vitest.config.*"
  - "**/jest.config.*"
  - "playwright.config.*"
---

# Testing

- Unit tests (Vitest; Jest in `apps/mobile`) cover business logic in `packages/core`: order state machine, pricing, permissions and refunds first. End-to-end tests (Playwright in `e2e/`) only for the critical flows in docs/PRD.md §05, above all a full order with payment in Stripe test mode.
- Structure every test as Arrange-Act-Assert, with a blank line between the three parts.
- Default to state-based tests: real domain objects, assertions on outputs and state. Mock only at the boundaries: Stripe, Ably, Twilio, Resend, Inngest, the clock, randomness.
- Database tests use `mongodb-memory-server`, never Atlas.
- Test names state the behaviour: `rejects a transition from Ready back to New`.
- A bug fix starts with a failing test that reproduces the bug.
- Money assertions use exact integer forints; cover rounding of service fee, tip, discount and commission.
- No network or real third-party calls in unit tests. Test data comes from factories next to `packages/db/src/seed.ts`.
- Deterministic tests: fixed time (`vi.setSystemTime`, `Europe/Budapest` business-day boundaries), seeded data, no order dependence.
- Commands: `pnpm test` (unit), `pnpm test:e2e` (e2e). A task is not done while tests fail.
