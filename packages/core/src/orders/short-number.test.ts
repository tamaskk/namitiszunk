import { connectDb, Counter } from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { allocateShortNumber, formatShortNumber } from "./short-number";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

describe("formatShortNumber", () => {
  it("prefixes the number with #, no upper bound", () => {
    expect(formatShortNumber(1)).toBe("#1");
    expect(formatShortNumber(12345)).toBe("#12345");
  });
});

describe("allocateShortNumber", () => {
  let replSet: MongoMemoryReplSet;
  let mongoose: Awaited<ReturnType<typeof connectDb>>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    mongoose = await connectDb(replSet.getUri("namitiszunk_short_test"));
    await Counter.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await Counter.deleteMany({});
  });

  it("gives 100 parallel allocations exactly 1..100", async () => {
    const venueId = new Types.ObjectId();
    const numbers = await Promise.all(
      Array.from({ length: 100 }, () =>
        allocateShortNumber(venueId, "2026-11-07"),
      ),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });

  it("gives concurrent first calls on many new days distinct numbers", async () => {
    const venueId = new Types.ObjectId();
    const days = ["2026-11-08", "2026-11-09", "2026-11-10"];

    const numbers = await Promise.all(
      days.flatMap((day) =>
        Array.from({ length: 5 }, async () => [
          day,
          await allocateShortNumber(venueId, day),
        ]),
      ),
    );

    for (const day of days) {
      const ofDay = numbers.filter(([d]) => d === day).map(([, n]) => n);
      expect(ofDay.sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("retries once when two first calls race on the insert", async () => {
    const venueId = new Types.ObjectId();
    const original = Counter.findOneAndUpdate.bind(Counter);
    const spy = vi
      .spyOn(Counter, "findOneAndUpdate")
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("E11000 duplicate key"), {
          code: 11000,
        });
      })
      .mockImplementation(original);

    const number = await allocateShortNumber(venueId, "2026-11-07");

    expect(number).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("restarts per venue and per business day", async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(await allocateShortNumber(a, "2026-11-07")).toBe(1);
    expect(await allocateShortNumber(a, "2026-11-07")).toBe(2);
    expect(await allocateShortNumber(b, "2026-11-07")).toBe(1);
    expect(await allocateShortNumber(a, "2026-11-08")).toBe(1);
  });

  it("rolls back with an aborted transaction", async () => {
    const venueId = new Types.ObjectId();
    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await allocateShortNumber(venueId, "2026-11-07", session);
        throw new Error("payment failed");
      }),
    ).rejects.toThrow("payment failed");
    await session.endSession();
    expect(await allocateShortNumber(venueId, "2026-11-07")).toBe(1);
  });
});
