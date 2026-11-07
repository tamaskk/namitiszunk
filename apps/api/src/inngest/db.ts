import "server-only";

import { connectDb } from "@namitiszunk/core/api";

export async function connectJobsDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await connectDb(uri);
}
