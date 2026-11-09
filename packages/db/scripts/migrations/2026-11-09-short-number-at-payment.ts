// T-024 migration: the short order number moves from checkout to payment. Safe to run twice.
// Replaces the unique { venueId, businessDate, shortNumber } index with the partial one the Order
// model declares ("short_number"), so orders awaiting payment can exist without a number.
// RUN IT BEFORE DEPLOYING the T-024 code to that database: with the old index the new checkout
// fails on the day's second unpaid order. The old code works with the new index (it always numbers).
// Numbers old checkouts gave stay; payment replaces them from the same Counter, so nothing collides.
// The database name must be passed back, as in check-transaction.ts:
//   node --env-file=../../apps/api/.env.local scripts/migrations/2026-11-09-short-number-at-payment.ts <database name>
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = await MongoClient.connect(uri, {
  serverSelectionTimeoutMS: 8000,
});
try {
  const db = client.db();
  const hosts = client.options.hosts.map(String).join(", ");
  if (process.argv[2] !== db.databaseName) {
    throw new Error(
      `Refusing to write to ${hosts}: pass the database name "${db.databaseName}" as the first argument.`,
    );
  }
  console.log(`database ${db.databaseName} on ${hosts}`);
  const orders = db.collection("orders");

  // A database without orders yet (a fresh preview) has no collection and so no old index.
  const existing = await orders.indexes().catch((error: unknown) => {
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  });
  const old = existing.find(
    (index) =>
      JSON.stringify(index.key) ===
        JSON.stringify({ venueId: 1, businessDate: 1, shortNumber: 1 }) &&
      !index.partialFilterExpression,
  );
  if (old?.name) {
    await orders.dropIndex(old.name);
    console.log(`dropped index ${old.name}`);
  }
  await orders.createIndex(
    { venueId: 1, businessDate: 1, shortNumber: 1 },
    {
      name: "short_number",
      unique: true,
      partialFilterExpression: { shortNumber: { $type: "number" } },
    },
  );
  console.log("index short_number in place");
} finally {
  await client.close();
}
