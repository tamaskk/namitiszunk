# PRD: Na, mit iszunk?

Status: Draft · Last updated: 2026-11-03

Sources: the product document ([Na, mit iszunk? – Teljes termékdokumentáció](https://claude.ai/artifact/LFFS9WPtKww24aYceKDszq), decisions up to 2026-11-02) and `docs/fejlesztesi-terv.md` (117 tasks, Hungarian). When this file and those disagree, ask.

## 01 Product overview

| Field | Value |
| --- | --- |
| Product name | Na, mit iszunk? (namitiszunk.hu) |
| Tagline | Order and pay for drinks at the club from your phone |
| Description | An ordering and payment system for nightclubs and bars. Guests scan a QR code, order and pay on their phone; the bar gets the order on a live list and the guest is notified when to pick it up. Five surfaces share one backend. |
| Stage | Idea → building the web MVP for a single pilot club |
| Platform | Web (guest ordering, club admin with a tablet bar view, platform HQ, landing) + API; native mobile app (Expo) in phase 3 |

## 02 Problem

At a busy club bar, guests wait in a crowd to catch the bartender's eye, then wait again to pay. Bartenders spend peak hours taking orders and handling cards instead of making drinks.

Today, a guest has to queue and shout an order at the bar because ordering, paying and making the drink all happen in one place at once. This costs the guest 10+ minutes per round at peak, and costs the club lost rounds and slower service.

## 03 Goal

Help club guests order and pay for a drink in under 60 seconds from their phone, and pick it up when it is ready, without queuing to order or pay.

## 04 Target users

Primary user (guest):
- Who: a club or bar visitor, 18+, on their own phone, often on weak 4G in a dark room.
- Trigger: they want a drink and see a long crowd at the bar, or a QR code on the table or wall.
- Today they use: queuing at the bar and paying by card or cash.
- They will switch because: no app install, Apple Pay / Google Pay in two taps, and a live "ready" signal instead of waiting in the crowd.

Secondary users (they change what we build):
- Bartender: a tablet bar view (New / In progress / Ready), sound alert, sold-out toggle, pause, pick-up code check.
- VIP host: delivers bottle orders placed from VIP table QR codes.
- Manager and Owner: menu, bars, QR codes, staff, orders and refunds, daily report, Stripe Connect payouts.
- Platform team (HQ): creates venues, sets commission, global order search, support refunds, audit log. 2FA required.
- Prospective club owner: reads the one-page demo site and requests a demo.

Not for (v1):
- Restaurants with table service and open tabs: delivery to tables, tabs and bill splitting come after the pilot.
- Clubs that need POS integration on day one: there is no POS integration in v1.

## 05 Core features

v1 = the web MVP for the pilot (product document "Az MVP része"). Task numbers refer to `docs/fejlesztesi-terv.md`.

| # | Feature | What the user can do | Done when |
| --- | --- | --- | --- |
| F1 | Guest ordering (#40–#48) | Scan a QR code, browse the venue menu, add items with options, pay with Apple Pay / Google Pay / card / Link, add a tip and promo code | A paid order reaches the bar view within 2 s of the Stripe webhook; the menu page LCP is under 2.5 s on 4G |
| F2 | Live status and pick-up (#43, #36) | See the order move New → In progress → Ready, get an optional SMS, show a short order number and pick-up code | The status page updates without reload; the bartender can match the code and set the order to Picked up |
| F3 | Bar view PWA (#54) | Accept, prepare and hand over orders; sound alert; sold-out toggle; pause ordering; "receipt entered" marker; peak summary | A bartender handles a full order lifecycle on a tablet without a mouse, and keeps working through a short network drop |
| F4 | Club admin (#50–#59, #61) | Manage menu, bars, VIP tables and QR codes, orders and refunds, staff (PIN and email invites), settings, Stripe Connect, daily report | An owner sets up a venue end to end and receives a payout on a test account |
| F5 | Platform HQ (#66, #67, #69, #71) | Create a venue, invite the owner, set the commission (1% in the pilot), search any order, refund for support, read the audit log | Every refund and fee change appears in the audit log with actor and time |
| F6 | Languages (#15) | Use every surface in Hungarian or English | A missing English key fails CI; `formatHuf(1990)` renders "1 990 Ft" everywhere |
| F7 | Demo site (#74) | Read the one-page demo site with the legal pages, and request a demo | A submitted demo request appears in the HQ leads module and sends an email |

Key user flow:
1. The guest scans the QR code; the venue menu opens (no install).
2. They add drinks to the cart and pay with Apple Pay, Google Pay or card.
3. After the Stripe webhook, the order appears on the selected bar's screen as New.
4. The bartender accepts it (In progress), then finishes it (Ready).
5. The guest is notified (live page or SMS) with the order number and pick-up code.
6. The bartender checks the code and the guest's age, hands over the drink; the order becomes Picked up.

## 06 Success metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Gate 1: a real guest's paid order goes all the way to pick-up | 1 order, at the pilot club | Admin orders module |
| Gate 2: share of the bar's orders placed by QR code | ≥ 15% (assumed — confirm) | Admin reports vs. the club's till total (#82) |
| Gate 2: average preparation time (New → Ready) | ≤ 5 min (assumed — confirm) | Admin reports (#82) |
| Order time from QR scan to payment | ≤ 60 s median | PostHog funnel: scan → menu → cart → payment → pick-up |
| Order to bar screen latency | ≤ 2 s p95 | Ably / API timing logs |

## 07 Out of scope

Do not build these in v1, even if they look easy:
- Native mobile app features, push notifications, loyalty (phase 3; only an empty Expo shell exists in v1).
- Table delivery, open tabs, bill splitting, gift drinks.
- POS integration and stock management.
- Automatic commission invoicing, CRM, push campaigns, feature flags.
- Full landing site, blog, ROI calculator (v1 has the one-page demo site only).
- Multi-bar UI (bar picker, moving orders between bars, per-bar reports): the pilot venue has one bar, but the data model supports many.
- Per-item rejection and partial refunds: in v1 only whole orders in New can be rejected, with a full refund.

## 08 Open questions

- Receipts: does the accountant approve the "receipt entered at In progress" flow (bartender keys the order into the club's online till)? If not, the bar view and payment flow change (#2).
- Gate 2 target values (15% QR share, 5 min preparation time) are assumed — confirm with the pilot club before go-live.
- Accent color: one of three neon candidates, chosen on the wireframes (#11, #16); placeholder until then (assumed — confirm).
- Fonts Inter + JetBrains Mono and the Lucide icon set (assumed — confirm).
- Stripe HUF decimal handling must be verified during payment development.

## 09 Glossary

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Venue (helyszín) | A club or bar using the product; owns a Stripe connected account | Bar |
| Bar (pult) | A physical counter in a venue that receives orders; a venue can have several | Venue |
| Bar view (Pult nézet) | The tablet PWA bartenders use to process orders | Admin dashboard |
| HQ (Saját admin) | The platform team's internal admin at hq.namitiszunk.hu | Club admin |
| Short order number | Per-venue number that restarts every business day; what bartender and guest say aloud | Order id |
| Pick-up code | Code the guest shows at pick-up | Short order number |
| Business day | Venue-local day boundary (e.g. 06:00) used for numbering and reports | Calendar day |
| Application fee | Platform commission deducted by Stripe on each direct charge | Service fee (venue's optional fee paid by the guest) |
| Confirmation (visszaigazolás) | Proof of payment shown to the guest; never presented as a fiscal receipt | Receipt (nyugta) |
