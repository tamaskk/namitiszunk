---
paths:
  - "packages/db/**"
  - "packages/core/**"
  - "**/*.model.ts"
  - "**/*.schema.ts"
  - "scripts/migrations/**"
  - "apps/api/src/inngest/retention.ts"
---

# Database (MongoDB + Mongoose)

- Schema changes (new collection, removed or renamed field, index change) need approval: docs/ARCHITECTURE.md §08.
- One cached connection in `packages/db`, reused across hot reloads and serverless invocations. Never connect inside a request handler.
- Models live in `packages/db/src/`. `packages/core` services may query the models directly; apps never do (they call core).
- Validate at the boundary with Zod. Never pass `req.body` or query-param objects into a query (NoSQL operator injection). Validate ObjectIds.
- Amounts are integer forints. Order items store a snapshot of name, price and options. Menu items are archived, never deleted.
- Never update an order's `status` directly; use `transition()` from `@namitiszunk/core/orders` (`packages/core/src/orders/transition.ts`).
- Reads: projection and `.lean()`; paginate lists; an index for every hot-path query (venue + business day + status for the bar view); no N+1 loops.
- Multi-document writes that must succeed together (order + payment + audit) use a transaction.
- Retention: guest phone numbers 30 days, inactive accounts 2 years; deletions run in the Inngest retention job, never ad hoc.
- Data migrations are idempotent scripts in `scripts/migrations/` that are safe to run twice.
