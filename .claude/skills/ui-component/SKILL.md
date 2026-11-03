---
name: ui-component
description: Build or change a React UI component the project's way - dark-theme design tokens from docs/DESIGN_SYSTEM.md, reuse of @namitiszunk/ui primitives, all states, i18n copy, mobile first, accessible. Use when creating or modifying components or pages in apps/* or packages/ui.
paths:
  - "packages/ui/**"
  - "apps/*/components/**"
  - "apps/*/app/**/*.tsx"
---

# UI component workflow

1. Read docs/DESIGN_SYSTEM.md if you have not in this session. List the primitives exported by `packages/ui/src/index.ts`.
2. Reuse, then compose, then create. A new primitive only if nothing fits: ask first, build it in `packages/ui`, and add it to DESIGN_SYSTEM.md §06 in the same change.
3. Tokens only (no raw hex, no off-scale spacing). Typography roles from §03; tabular numerals for prices, order numbers and codes.
4. States: default, hover, focus-visible, active, disabled, loading. Data views: loading, empty, error. Guest screens: paused, closed, sold out, payment failed, offline.
5. Copy: message keys in `packages/i18n/messages/hu.json` and `en.json`; prices with `formatHuf`.
6. Size: guest screens at 375px, touch targets at least 48px; bar view on a landscape tablet with 64px actions.
7. Accessibility: semantic elements, labels, `aria-label` for icon-only buttons, visible focus ring, AA contrast on black.
8. Server component unless it needs state, effects or browser APIs; `"use client"` at the leaf.
9. Verify: `pnpm typecheck`; with the Playwright MCP server or `/verify`, check 375px and 1280px in hu and en.
