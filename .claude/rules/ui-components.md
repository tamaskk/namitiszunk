---
paths:
  - "packages/ui/**"
  - "apps/*/components/**"
  - "apps/*/app/**/*.tsx"
  - "apps/*/app/**/*.css"
  - "apps/mobile/**/*.tsx"
---

# UI components

- Before creating or changing UI, read docs/DESIGN_SYSTEM.md if you have not in this session.
- Tokens only: colors, spacing, radius and typography from DESIGN_SYSTEM.md / `packages/ui/tokens.json`. No raw hex, no arbitrary values like `p-[13px]`.
- Reuse `@namitiszunk/ui` primitives first; apps never copy shadcn components. A new primitive needs approval and a DESIGN_SYSTEM.md §06 entry in the same change.
- Every data-driven view has loading, empty and error states; guest screens also handle paused, closed, sold out, failed payment and lost connection.
- Dark theme only. Touch targets at least 48px (bar view actions 64px). Guest screens work at 375px; the bar view on a landscape tablet.
- Accessibility (WCAG 2.1 AA): semantic HTML, visible labels, `aria-label` on icon-only buttons, visible focus ring, AA contrast, the order flow works with a screen reader.
- All copy from `@namitiszunk/i18n`, in hu and en; prices via `formatHuf`.
- Server components by default. `"use client"` only for state, effects or browser APIs, as deep in the tree as possible. Guest app JS budget: under 150 KB.
- UI copy follows the tone rules in DESIGN_SYSTEM.md §01.
