// Restore check (T-019): counts every collection and finds the newest order, read-only.
// Run against the cluster a snapshot was restored to, never to fix data:
//   RESTORE_CHECK_URI=... pnpm --filter @namitiszunk/db verify-restore [--save counts.json] [--compare counts.json]
// docs/runbooks/restore.md describes the full drill.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { MongoClient, type Db } from "mongodb";

export type RestoreStats = {
  database: string;
  collections: Record<string, number>;
  latestOrderAt: string | null;
};

export type CountMismatch = {
  collection: string;
  expected: number | null;
  actual: number | null;
};

/** Every collection whose count differs, including ones missing on either side. */
export function diffCounts(
  expected: Record<string, number>,
  actual: Record<string, number>,
): CountMismatch[] {
  const names = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ].sort();
  return names
    .map((collection) => ({
      collection,
      expected: expected[collection] ?? null,
      actual: actual[collection] ?? null,
    }))
    .filter((row) => row.expected !== row.actual);
}

export async function collectStats(db: Db): Promise<RestoreStats> {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
  const collections: Record<string, number> = {};
  for (const name of names) {
    collections[name] = await db.collection(name).countDocuments();
  }
  const latest = names.includes("orders")
    ? await db
        .collection<{ createdAt?: Date }>("orders")
        .find({}, { projection: { createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(1)
        .next()
    : null;
  return {
    database: db.databaseName,
    collections,
    latestOrderAt: latest?.createdAt?.toISOString() ?? null,
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { save: { type: "string" }, compare: { type: "string" } },
  });
  const uri = process.env.RESTORE_CHECK_URI;
  if (!uri) {
    console.error(
      "RESTORE_CHECK_URI is missing (the restored cluster's connection string, with the database name).",
    );
    return 2;
  }

  const client = new MongoClient(uri);
  try {
    const stats = await collectStats(client.db());
    console.log(JSON.stringify(stats, null, 2));
    if (values.save) writeFileSync(values.save, JSON.stringify(stats, null, 2));
    if (!values.compare) return 0;

    const expected = JSON.parse(
      readFileSync(values.compare, "utf8"),
    ) as RestoreStats;
    const mismatches = diffCounts(expected.collections, stats.collections);
    if (mismatches.length === 0) {
      console.log(
        `OK: ${Object.keys(stats.collections).length} collections match ${values.compare}`,
      );
      return 0;
    }
    console.error("Counts differ:");
    console.table(mismatches);
    return 1;
  } finally {
    await client.close();
  }
}

// Runs only as a CLI, so the test can import diffCounts without connecting.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
