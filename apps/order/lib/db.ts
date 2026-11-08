import "server-only";

import { connectDb } from "@namitiszunk/core/api";

/** Opens (or reuses) the process-wide database connection before a core call. */
export async function ensureDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await connectDb(uri);
}
