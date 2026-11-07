# Code style

- TypeScript strict. No `any` (use `unknown` and narrow). No `@ts-ignore` or `@ts-expect-error` without a comment explaining why.
- File names kebab-case (`order-card.tsx`); components PascalCase; hooks `useThing` in `use-thing.ts`.
- Named exports only, except where the framework requires a default export (Next.js `page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`, `route` handlers export named HTTP methods; Expo Router screens).
- Cross-package imports use the package name (`@namitiszunk/core`), never relative paths into another package. Inside an app, use its `@/` alias; no `../../../` chains.
- One function, one job. Name it by what it does (`calculateOrder`, not `handleOrder2`).
- Money: integer forints (`amountHuf: number`, integers only). Never floats, never `toFixed` on amounts; format only with `formatHuf` from `@namitiszunk/i18n`.
- User-facing strings come from `@namitiszunk/i18n` message keys (hu and en). No hard-coded copy.
- Never swallow errors. Catch only where you can handle them or add context; report unexpected errors to Sentry once.
- Modules that touch the database, third-party SDKs or secrets import `server-only`. Client components start with `"use client"` and stay at the leaves of the tree.
- Comments explain why, not what. No commented-out code. No TODO without a task id (`T-0xx`).
- Formatting belongs to Prettier; a hook formats every file you edit. Do not hand-format.
