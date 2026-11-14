// The HQ's first account (T-066):
//   pnpm --filter @namitiszunk/db hq:create-admin --email you@example.com
// into MONGODB_URI (apps/hq/.env.local; an exported shell variable wins). Safe to run twice.
import { parseArgs } from "node:util";

import mongoose from "mongoose";

import { ensureHqAdmin } from "../src/hq-admin";

const { values } = parseArgs({ options: { email: { type: "string" } } });
if (!values.email) throw new Error("usage: hq:create-admin --email <address>");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
try {
  const { userId, created } = await ensureHqAdmin(values.email);
  console.log(
    `ok: ${created ? "created" : "updated"} HQ admin ${userId} in database "${mongoose.connection.name}"; the first HQ sign-in sets up 2FA`,
  );
} finally {
  await mongoose.disconnect();
}
