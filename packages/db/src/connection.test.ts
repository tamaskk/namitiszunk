import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pingDb } from "./connection";

let replSet: MongoMemoryReplSet;
let uri: string;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  uri = replSet.getUri("namitiszunk_ping_test");
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("pingDb", () => {
  it("is true while the database answers", async () => {
    const answered = await pingDb(uri);

    expect(answered).toBe(true);
  });

  it("is false, not an error, once the database stops answering", async () => {
    await replSet.stop();

    const answered = await pingDb(uri, 500);

    expect(answered).toBe(false);
  });
});
