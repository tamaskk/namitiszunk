// Transaction check (T-020): proves the cluster runs multi-document transactions, commit and rollback.
// Writes only to two throwaway collections and drops them afterwards. The database name must be
// passed back as an argument, so a pulled production env cannot be written to by accident:
//   node --env-file=../../apps/api/.env.local scripts/check-transaction.ts <database name>
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = await MongoClient.connect(uri, {
  serverSelectionTimeoutMS: 8000,
});
const db = client.db();
if (process.argv[2] !== db.databaseName) {
  await client.close();
  console.error(
    `Refusing to write: pass the database name "${db.databaseName}" as the first argument.`,
  );
  process.exit(1);
}
const orders = db.collection("_txcheck_orders");
const payments = db.collection("_txcheck_payments");
const run = `${Date.now()}`;

async function count(): Promise<number> {
  return (
    (await orders.countDocuments({ run })) +
    (await payments.countDocuments({ run }))
  );
}

try {
  await client.withSession((session) =>
    session.withTransaction(async () => {
      await orders.insertOne({ run }, { session });
      await payments.insertOne({ run }, { session });
    }),
  );
  if ((await count()) !== 2) throw new Error("commit: expected 2 documents");

  await client
    .withSession((session) =>
      session.withTransaction(async () => {
        await orders.insertOne({ run, rollback: true }, { session });
        throw new Error("planned failure");
      }),
    )
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "planned failure")
        throw error;
    });
  if ((await count()) !== 2)
    throw new Error("rollback: the failed write was kept");

  console.log("ok: commit and rollback both work");
} finally {
  await orders.drop().catch(() => undefined);
  await payments.drop().catch(() => undefined);
  await client.close();
}
