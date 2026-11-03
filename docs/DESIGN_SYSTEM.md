# Design System: Na, mit iszunk?

The product is used in dark clubs, on phones at minimum brightness and on bar tablets at peak hours. Every screen is dark-first, high-contrast and built for one-handed, fast use. Values marked (assumed — confirm) wait for the wireframes (task #11) and are listed in PRD §08.

## 01 Brand identity

- Personality: fast, confident, nightlife.
- Tone in UI copy: plain, short sentences, second person informal in Hungarian ("Rendelésed kész"), no exclamation marks, no jokes in errors.
- Feel: black canvas, one neon accent, large touch targets. Never busy; the order status is always the loudest thing on screen.
- UI languages and locale: `hu-HU` (default) and `en`. Currency HUF without decimals ("1 990 Ft"); dates `2026. 11. 03.`; times 24-hour; time zone `Europe/Budapest`. All copy comes from `packages/i18n`, never hard-coded.
- Reference: shadcn/ui default theme as the base until the brand is finalised.

## 02 Color palette

Use tokens in components. Never raw hex values. Dark is the only theme in v1.

| Token | Value | Use |
| --- | --- | --- |
| --color-bg | #0A0A0B | Page background |
| --color-surface | #151518 | Cards, panels, inputs, sheets |
| --color-border | #2A2A2F | Dividers, input borders |
| --color-text | #F5F5F7 | Body text |
| --color-text-muted | #A1A1AA | Secondary text, captions |
| --color-primary | #C8FF2E (assumed — confirm) | Primary buttons, links, active states, the "Ready" highlight |
| --color-primary-hover | #B4EB1A (assumed — confirm) | Hover on primary |
| --color-on-primary | #0A0A0B | Text and icons on primary |
| --color-success | #22C55E | Confirmations, Picked up |
| --color-warning | #F59E0B | Non-blocking warnings, paused ordering |
| --color-danger | #F87171 | Errors, destructive actions, rejected orders |

Rules:
- One accent color. Status colors are for state, not decoration.
- Text and the accent pass WCAG AA on `--color-bg` (4.5:1 for body text). The accent candidate must reach at least 4.5:1 on black (#16).
- Light theme: not supported in v1. Never hard-code a color; a light set may be added later under the same token names.

## 03 Typography

| Role | Font | Size | Weight | Line height |
| --- | --- | --- | --- | --- |
| Display | Inter | 40px | 700 | 1.1 |
| H1 | Inter | 32px | 700 | 1.15 |
| H2 | Inter | 24px | 600 | 1.2 |
| H3 | Inter | 20px | 600 | 1.3 |
| Body | Inter | 16px | 400 | 1.5 |
| Small | Inter | 14px | 400 | 1.5 |
| Label | Inter | 12px | 500 | 1.4, uppercase, 0.04em tracking |
| Order number | Inter | 48px | 800 | 1.0, tabular numerals |
| Code | JetBrains Mono | 14px | 400 | 1.5 |

Rules:
- Fonts are assumed (Inter, JetBrains Mono) — confirm on the wireframes.
- Prices, order numbers and pick-up codes use tabular numerals.
- Body text never below 16px on guest screens; never more than two families on a page.

## 04 Spacing

Base unit: 4px. Only use values from this scale.

| Token | Value | Typical use |
| --- | --- | --- |
| space-1 | 4px | Icon gaps |
| space-2 | 8px | Inside small components |
| space-3 | 12px | Input padding |
| space-4 | 16px | Default gap; mobile side padding |
| space-6 | 24px | Card padding |
| space-8 | 32px | Between groups |
| space-12 | 48px | Between sections |
| space-24 | 96px | Landing sections (desktop) |

Layout:
- Guest app: single column, max width 480px, 16px side padding, sticky bottom action bar.
- Admin and HQ: max content width 1280px, side navigation from `lg`.
- Bar view: full-screen landscape tablet, three columns (New / In progress / Ready).

## 05 Border radius and shadows

| Token | Value | Use |
| --- | --- | --- |
| radius-sm | 6px | Inputs, tags, badges |
| radius-md | 10px | Buttons, dropdowns |
| radius-lg | 16px | Cards, sheets, dialogs |
| radius-full | 9999px | Avatars, pills |

Shadows: on a black background, elevation comes from a lighter surface plus a border, not a shadow. Dialogs and sheets may use `0 8px 32px rgba(0, 0, 0, 0.6)`.

## 06 Components

Primitives live in `packages/ui` (shadcn/ui, restyled with these tokens). Reuse before creating. A new variant needs approval and an entry here.

Buttons

| Variant | Background | Text | Border | Use |
| --- | --- | --- | --- | --- |
| Primary | primary | on-primary | none | One per screen, the main action (Pay, Accept, Ready) |
| Secondary | surface | text | border | Supporting actions |
| Ghost | transparent | text | none | Low-emphasis actions, toolbars |
| Danger | danger | bg | none | Reject, refund, delete; always confirm |

- Height at least 48px everywhere (bar view actions 64px), padding 0 16px, radius-md, Small 500 or Body 600.
- States: hover (primary-hover), active (darken 12%), focus (2px primary ring with 2px offset), disabled (50% opacity, no pointer).
- Loading: spinner replaces the label, width stays fixed. Payment buttons never allow a double submit.

Inputs
- Height 48px, radius-sm, surface background, border color-border, focus ring primary.
- Label above the field, always visible. Placeholder is a hint, never the label.
- Error: border danger, message below in danger at 14px.
- Forms use react-hook-form + the shared Zod schema from `packages/validators`.

Cards
- Surface background, radius-lg, padding space-6, 1px color-border.

Dialogs and sheets
- Dialog max width 480px; on phones, product details and the cart use a bottom Sheet.
- Overlay `rgba(0, 0, 0, 0.7)`. Close on overlay click and on Escape; destructive dialogs require the explicit button.

Other primitives in `packages/ui`: Select, Tabs, Table, Badge (order status), Toast (Sonner), Form, EmptyState.

Order status badges: New = primary outline, In progress = warning, Ready = primary solid, Picked up = success, Rejected / Refunded = danger.

Empty states
- One line saying what belongs here, plus one primary action. Never a blank panel.

## 07 Icons

- Set: Lucide (assumed — confirm). One set only.
- Sizes: 16px inline, 20px in buttons, 24px standalone, 32px in the bar view.
- Stroke width 1.75.
- An icon is never the only label on an action. Add text or an `aria-label`.

## 08 Responsive breakpoints

| Name | Min width | Notes |
| --- | --- | --- |
| sm | 640px | Phones in landscape |
| md | 768px | Tablets in portrait |
| lg | 1024px | Tablets in landscape (bar view), laptops; side navigation appears |
| xl | 1280px | Desktops, max content width applies |

Rules:
- Guest screens: mobile first, every screen works at 375px wide.
- Bar view: designed for a landscape tablet (≥ 1024px), usable at 768px.
- Touch targets at least 48px. No horizontal scrolling except tables.

## 09 Motion

- Duration: 150ms micro interactions, 250ms sheets and panels.
- A new order in the bar view: one highlight pulse plus a sound; no continuous animation.
- Respect `prefers-reduced-motion`: disable non-essential animation.

## 10 Implementation

- Tokens have one source: `packages/ui/tokens.json`. It generates the web CSS variables (`packages/config/tailwind`, Tailwind v4 `@theme`) and the mobile NativeWind config (Tailwind v3). Never a shared Tailwind config: the versions differ.
- This file and `tokens.json` change in the same commit.
- Primitives live in `packages/ui/src/`; apps never copy shadcn components. A dev-only showcase lives at `apps/admin/app/dev/ui/`.
- Anything not defined here: ask before inventing it.
