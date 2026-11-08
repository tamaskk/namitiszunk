# Tasks

Short list of what is being worked on. IDs are T-### where ### = the task number in `docs/fejlesztesi-terv.md`, which holds the full description, acceptance criteria and dependencies (Hungarian). Feature refs F# = docs/PRD.md §05. Tick a box only when AGENTS.md §07 is met.

## Now
- [ ] T-001 Stripe platform account and Connect setup (business, not code)
- [ ] T-005 DNS to Vercel and email sending domain (business, not code)
- [x] T-012 Monorepo scaffold: Turborepo + pnpm, 5 Next.js apps, empty Expo shell, packages
- [x] T-013 CI (GitHub Actions): lint, typecheck, test, build, gitleaks

## Next
- [ ] T-014 Environments, secrets and deploy (`packages/config/src/env.ts`, 5 Vercel projects)
- [ ] T-015 (F6) Shared i18n package (next-intl, hu + en, formatHuf)
- [x] T-016 UI base and dark theme (`packages/ui`, tokens.json)
- [x] T-020 Mongoose models and indexes
- [ ] T-021 Order state machine
- [ ] T-022 Pricing (subtotal, service fee, tip, discount, commission)
- [ ] T-023 RBAC permissions

## Open decisions
- [ ] Guest cancel abuse (from the T-043 review): at a manual-acceptance venue a guest can pay and cancel repeatedly, and each refund leaves the Stripe fee with the venue. Decide whether to cap guest cancels per device or phone per business day.

## Later (after these)
- [ ] Remaining v1 tasks in `docs/fejlesztesi-terv.md` sections C–I (#17–#83)

## Done
