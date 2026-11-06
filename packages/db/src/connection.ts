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
