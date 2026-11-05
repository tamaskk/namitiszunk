# Backup and restore (T-019)

Production data lives on Atlas Flex with automatic daily snapshots. There is no point-in-time recovery until the move to M10 (task 116), so in the worst case one day of orders is missing from a snapshot and has to be rebuilt from Stripe.

**Never restore a snapshot onto the production cluster.** It overwrites everything written since the snapshot. Always restore to a separate, temporary cluster, check it, then copy what is needed.

## Tools

- mongosh and MongoDB Database Tools: `brew tap mongodb/brew && brew install mongosh mongodb-database-tools`.
- The check script: `RESTORE_CHECK_URI=<uri with database name> pnpm --filter @namitiszunk/db verify-restore [--save file.json] [--compare file.json]`. It is read-only: it prints the document count per collection and the newest order's `createdAt`, saves that as JSON, or compares it with a saved file (exit 1 on any difference, 2 on a missing URI).

## Restore after data loss

1. **Stop the damage.** Find what went wrong (bad deploy, script, manual edit) and stop it. Pause ordering for the affected venues if orders are being lost.
2. **Pick the snapshot.** Atlas → the production project → cluster → Backup: choose the newest snapshot taken before the incident. Note its time (UTC).
3. **Create the temporary cluster.** In the same project, a new Flex cluster named `restore-YYYYMMDD`, region Frankfurt.
4. **Restore the snapshot onto `restore-YYYYMMDD`.** In the snapshot's menu choose Restore and pick the temporary cluster as the target. Write down the start time.
5. **Check it.** Create a temporary database user with read access on the temporary cluster, then run the check script against it. Compare the counts with what you expect at the snapshot time (the last saved check, the dashboards, the Stripe totals for the day). Write down the end time.
6. **Bring the data back.** Either:
   - copy only the affected collections from the temporary cluster to production:
     `mongodump --uri="<restore uri>" --db=namitiszunk --collection=<name> --out=dump` then
     `mongorestore --uri="<production uri>" --nsInclude="namitiszunk.<name>" dump` (add `--drop` only when the collection on production must be replaced as a whole), or
   - when production is beyond repair, point `MONGODB_URI` of the five Vercel projects at the temporary cluster and redeploy. It then becomes production; rename and keep it.
7. **Rebuild the gap.** Orders paid after the snapshot are missing. List them in Stripe: Payments, filtered from the snapshot time, each PaymentIntent carries `orderId` and `venueId` in its metadata. Re-create those orders from the metadata and the Stripe line items, and tell the affected venues.
8. **Clean up.** Delete the temporary database user, and the temporary cluster if it did not become production. Record the incident: cause, snapshot used, measured restore time, data lost.

## Drill (before the pilot, then monthly)

Same steps 2–5 and 8, without touching production:

1. Right after a snapshot is taken (production has no traffic before the pilot), save the reference counts: `RESTORE_CHECK_URI=<production uri> pnpm --filter @namitiszunk/db verify-restore --save prod-counts.json`.
2. Restore that snapshot to `restore-YYYYMMDD` and time it from Restore click to cluster ready.
3. `RESTORE_CHECK_URI=<restore uri> pnpm --filter @namitiszunk/db verify-restore --compare prod-counts.json` must print `OK`.
4. Point a preview deployment of `namitiszunk-admin` at the temporary cluster (Preview `MONGODB_URI` for that branch only) and check that it starts and lists the orders.
5. Write the results in the log below, delete the temporary cluster, and set the next calendar reminder (first Monday of the month).

## Log

| Date | Snapshot | Restore time | Counts | Preview app | By |
| --- | --- | --- | --- | --- | --- |
| 2026-11-05 | none (tooling check on the dev M0: 3 collections, 281 documents, dump + restore into another database) | 9 s for dump + restore | OK; a deliberate 10-document gap was reported | not run (no models yet, T-020) | Claude |

Before the pilot, the first real drill from a Flex snapshot goes here. That row, not the tooling check above, ticks task 19.
