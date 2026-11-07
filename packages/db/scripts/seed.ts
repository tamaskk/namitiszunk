// Seeds the Demo Klub (T-027).
//   pnpm db:seed      into MONGODB_URI (apps/api/.env.local; an exported shell variable wins); refuses anything but localhost or a *_dev / *_test database.
//   pnpm db:seed:e2e  into MONGODB_URI when the e2e setup passes one, otherwise into a fresh in-memory
//                     replica set that stays up until Ctrl+C; ids are fixed either way (seedId).
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

import { assertSeedableUri, seedDemo } from "../src/seed";

const e2e = process.argv.includes("--e2e");
const memory =
  e2e && !process.env.MONGODB_URI
    ? await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    : undefined;
const uri = memory?.getUri("namitiszunk_e2e_test") ?? process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const dbName = assertSeedableUri(uri);
await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 8000 });
console.log(
  `seeding database "${mongoose.connection.name}" on ${mongoose.connection.host}`,
);
try {
  await seedDemo();
  console.log(
    `ok: Demo Klub seeded into database "${mongoose.connection.name}"`,
  );
} finally {
  await mongoose.disconnect();
}
if (memory) console.log(`in-memory MONGODB_URI=${uri} (Ctrl+C to stop)`);
