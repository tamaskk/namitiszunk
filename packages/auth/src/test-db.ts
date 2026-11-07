import { connectDb, RateLimit, VenueMember } from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";

export const testSecret = "test-secret-that-is-at-least-32-characters-long";

type Mongoose = Awaited<ReturnType<typeof connectDb>>;

/** One in-memory replica set per test file (never Atlas); returns a getter for the connection. */
export function useTestDb(): () => Mongoose {
  let replSet: MongoMemoryReplSet;
  let mongoose: Mongoose;
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    mongoose = await connectDb(replSet.getUri("namitiszunk_auth_test"));
    await Promise.all([RateLimit.syncIndexes(), VenueMember.syncIndexes()]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });
  return () => mongoose;
}
