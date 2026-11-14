import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureHqAdmin } from "./hq-admin";
import { PlatformMember, User } from "./models";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri("namitiszunk_hq_admin_test"));
  await Promise.all([User, PlatformMember].map((m) => m.createCollection()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

describe("ensureHqAdmin", () => {
  it("creates the user and an active platform admin role", async () => {
    const email = " Owner@Example.com ";

    const result = await ensureHqAdmin(email);

    const user = await User.findById(result.userId).lean();
    const member = await PlatformMember.findOne({ userId: user!._id }).lean();
    expect(result.created).toBe(true);
    expect(user).toMatchObject({
      email: "owner@example.com",
      emailVerified: true,
    });
    expect(member).toMatchObject({ role: "admin", isActive: true });
  });

  it("is safe to run twice and reactivates a disabled role on an existing user", async () => {
    const user = await User.create({ email: "me@example.com", name: "Me" });
    await PlatformMember.create({
      userId: user._id,
      role: "support",
      isActive: false,
    });

    const first = await ensureHqAdmin("me@example.com");
    const second = await ensureHqAdmin("me@example.com");

    expect(first).toEqual({ userId: String(user._id), created: false });
    expect(second).toEqual(first);
    expect(await User.countDocuments()).toBe(1);
    expect(
      await PlatformMember.find({}, { _id: 0, role: 1, isActive: 1 }).lean(),
    ).toEqual([{ role: "admin", isActive: true }]);
  });

  it("refuses something that is not an e-mail address", async () => {
    const input = "not-an-email";

    const result = ensureHqAdmin(input);

    await expect(result).rejects.toThrow("not an e-mail address");
    expect(await User.countDocuments()).toBe(0);
  });
});
