import "server-only";

import mongoose from "mongoose";

const cache = globalThis as typeof globalThis & {
  namitiszunkDb?: Promise<typeof mongoose>;
};

/**
 * One connection per process, reused across hot reloads and warm serverless invocations.
 * Ten connections per function instance keeps many instances under Atlas Flex's 500.
 */
export function connectDb(uri: string): Promise<typeof mongoose> {
  cache.namitiszunkDb ??= mongoose
    .connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 })
    .catch((error: unknown) => {
      cache.namitiszunkDb = undefined;
      throw error;
    });
  return cache.namitiszunkDb;
}

/**
 * Whether the database answers a ping within `timeoutMs` (the API health check, T-017).
 * Never throws: a down database is an answer here, not an error.
 */
export async function pingDb(uri: string, timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const ping = connectDb(uri)
    .then(async (db) => {
      await db.connection.db?.admin().command({ ping: 1 });
      return db.connection.db !== undefined;
    })
    .catch(() => false);
  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
