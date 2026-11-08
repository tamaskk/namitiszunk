// T-024 migration: the short order number moves from checkout to payment. Safe to run twice.
// 1. Replaces the unique { venueId, businessDate, shortNumber } index with the partial one the
//    Order model declares ("short_number"), so orders awaiting payment can exist without a number.
// 2. Removes the checkout-time number from orders that were never paid; payment gives them a new one.
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
  if (process.argv[2] !== db.databaseName) {
    throw new Error(
      `Refusing to write: pass the database name "${db.databaseName}" as the first argument.`,
    );
  }
  const orders = db.collection("orders");

  const old = (await orders.indexes()).find(
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

  const unnumbered = await orders.updateMany(
    { paidAt: { $exists: false }, shortNumber: { $exists: true } },
    { $unset: { shortNumber: "" } },
  );
  console.log(
    `index short_number in place; numbers removed from ${unnumbered.modifiedCount} unpaid orders`,
  );
} finally {
  await client.close();
}
