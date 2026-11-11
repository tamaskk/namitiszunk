import {
  AuditLog,
  Bar,
  connectDb,
  StaffDevice,
  Venue,
  VenueMember,
} from "@namitiszunk/db";
import { hash } from "@node-rs/argon2";
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

import type { Actor, VenueRole } from "../auth/permissions";
import {
  addPinMember,
  changeMemberPin,
  joinVenueByInvite,
  listStaff,
  memberLog,
  recordStaffInvite,
  revokeDevice,
  setMemberActive,
} from "./staff";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_staff_test"));
  await Promise.all(
    [Venue, Bar, VenueMember, StaffDevice, AuditLog].map((m) =>
      m.createCollection(),
    ),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

let venueId: string;
let ownerUserId: string;
let ownerMemberId: string;

const userActor = (
  userId: string,
  role: VenueRole,
  venue = venueId,
): Actor => ({
  kind: "user",
  userId,
  memberships: [{ venueId: venue, memberId: "m", role }],
});
const owner = () => userActor(ownerUserId, "owner");
const manager = () => userActor(new Types.ObjectId().toString(), "manager");

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  const venue = await Venue.create({
    name: "Klub",
    slug: `klub-${new Types.ObjectId()}`,
    timezone: "Europe/Budapest",
    businessDayStart: "06:00",
  });
  venueId = String(venue._id);
  ownerUserId = new Types.ObjectId().toString();
  const ownerMember = await VenueMember.create({
    venueId,
    userId: ownerUserId,
    role: "owner",
    displayName: "Tulaj",
  });
  ownerMemberId = String(ownerMember._id);
});

describe("addPinMember", () => {
  it("adds a bartender with a hashed PIN and logs it without the PIN", async () => {
    const { id } = await addPinMember(manager(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    const saved = await VenueMember.findById(id).select("+pinHash").lean();
    const entry = await AuditLog.findOne({ action: "staff.added" }).lean();
    expect(saved?.pinHash).toMatch(/^\$argon2/);
    expect(saved?.pinHash).not.toContain("1234");
    expect(entry?.after).toEqual({ name: "Anna", role: "bartender" });
  });

  it("refuses a PIN another member of the venue already uses", async () => {
    await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    const second = addPinMember(owner(), venueId, {
      name: "Bence",
      role: "vip_host",
      pin: "1234",
    });

    await expect(second).rejects.toMatchObject({
      status: 409,
      code: "pin_taken",
    });
  });

  it("allows the same PIN in another venue", async () => {
    const other = await Venue.create({
      name: "Másik",
      slug: `masik-${new Types.ObjectId()}`,
    });
    await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    const added = addPinMember(
      userActor(ownerUserId, "owner", String(other._id)),
      String(other._id),
      { name: "Anna", role: "bartender", pin: "1234" },
    );

    await expect(added).resolves.toHaveProperty("id");
  });

  it("refuses a name an active member already has", async () => {
    await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    const again = addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "5678",
    });

    await expect(again).rejects.toMatchObject({ code: "staff_name_taken" });
  });

  it("limits PIN writes to 10 a minute per person", async () => {
    const actor = manager();
    const tries = [];
    for (let i = 0; i < 10; i++)
      tries.push(
        await addPinMember(actor, venueId, {
          name: "Ugyanaz",
          role: "bartender",
          pin: String(1000 + i),
        }).catch((error: unknown) => error),
      );

    const eleventh = addPinMember(actor, venueId, {
      name: "Más",
      role: "bartender",
      pin: "2000",
    });

    await expect(eleventh).rejects.toMatchObject({ code: "rate_limited" });
    expect(tries.filter((t) => t instanceof Error)).toHaveLength(9);
  });

  it("refuses a bartender adding staff", async () => {
    const bartender: Actor = {
      kind: "staff",
      venueId,
      memberId: new Types.ObjectId().toString(),
      role: "bartender",
    };

    const added = addPinMember(bartender, venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    await expect(added).rejects.toMatchObject({ status: 403 });
  });
});

describe("changeMemberPin", () => {
  it("refuses a PIN in use and accepts the member's own current one", async () => {
    const anna = await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });
    await addPinMember(owner(), venueId, {
      name: "Bence",
      role: "bartender",
      pin: "5678",
    });

    const taken = changeMemberPin(manager(), venueId, anna.id, "5678");
    await expect(taken).rejects.toMatchObject({ code: "pin_taken" });
    await changeMemberPin(manager(), venueId, anna.id, "1234");

    expect(await AuditLog.countDocuments({ action: "staff.pinChanged" })).toBe(
      1,
    );
  });

  it("lets a Manager change a VIP host's PIN", async () => {
    const host = await addPinMember(owner(), venueId, {
      name: "Vera",
      role: "vip_host",
      pin: "4321",
    });

    await changeMemberPin(manager(), venueId, host.id, "8765");

    expect(await AuditLog.countDocuments({ action: "staff.pinChanged" })).toBe(
      1,
    );
  });

  it("has no PIN for an owner", async () => {
    const act = changeMemberPin(owner(), venueId, ownerMemberId, "1111");

    await expect(act).rejects.toMatchObject({ status: 404 });
  });
});

describe("setMemberActive", () => {
  it("disables a bartender, keeps the log and counts the disabled PIN as taken", async () => {
    const anna = await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });

    await setMemberActive(manager(), venueId, anna.id, false);

    const saved = await VenueMember.findById(anna.id).lean();
    expect(saved?.isActive).toBe(false);
    expect(await AuditLog.countDocuments({ "target.id": saved?._id })).toBe(2);
    await expect(
      addPinMember(owner(), venueId, {
        name: "Új",
        role: "bartender",
        pin: "1234",
      }),
    ).rejects.toMatchObject({ code: "pin_taken" });
  });

  it("does not let a Manager disable a Manager or the Owner", async () => {
    const other = await VenueMember.create({
      venueId,
      userId: new Types.ObjectId(),
      role: "manager",
      displayName: "Menedzser",
    });

    const act = () =>
      setMemberActive(manager(), venueId, String(other._id), false);
    const onOwner = () =>
      setMemberActive(manager(), venueId, ownerMemberId, false);

    await expect(act()).rejects.toMatchObject({ status: 403 });
    await expect(onOwner()).rejects.toMatchObject({ status: 403 });
  });

  it("keeps at least one active owner", async () => {
    const second = await VenueMember.create({
      venueId,
      userId: new Types.ObjectId(),
      role: "owner",
      displayName: "Társtulaj",
    });
    const third = userActor(new Types.ObjectId().toString(), "owner");

    await setMemberActive(third, venueId, ownerMemberId, false);
    const last = setMemberActive(third, venueId, String(second._id), false);

    await expect(last).rejects.toMatchObject({ code: "staff_last_owner" });
    expect((await VenueMember.findById(second._id).lean())?.isActive).toBe(
      true,
    );
  });

  it("refuses enabling a member whose name an active member took meanwhile", async () => {
    const old = await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });
    await setMemberActive(owner(), venueId, old.id, false);
    await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "5678",
    });

    const act = setMemberActive(owner(), venueId, old.id, true);

    await expect(act).rejects.toMatchObject({ code: "staff_name_taken" });
  });

  it("does not let the Owner disable themselves", async () => {
    const act = setMemberActive(owner(), venueId, ownerMemberId, false);

    await expect(act).rejects.toMatchObject({ code: "staff_self" });
  });

  it("does not reach a member of another venue", async () => {
    const elsewhere = await VenueMember.create({
      venueId: new Types.ObjectId(),
      role: "bartender",
      displayName: "Máshol",
    });

    const act = setMemberActive(owner(), venueId, String(elsewhere._id), false);

    await expect(act).rejects.toMatchObject({ status: 404 });
  });
});

describe("listStaff", () => {
  it("lists members with their last action, and devices that are still signed in", async () => {
    const anna = await addPinMember(owner(), venueId, {
      name: "Anna",
      role: "bartender",
      pin: "1234",
    });
    const bar = await Bar.create({ venueId, name: "Főpult" });
    await StaffDevice.create([
      {
        deviceId: "a",
        venueId,
        barId: bar._id,
        registeredBy: ownerUserId,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        deviceId: "b",
        venueId,
        registeredBy: ownerUserId,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    ]);

    const asManager = await listStaff(manager(), venueId);
    const asOwner = await listStaff(owner(), venueId);

    expect(asManager.members.map((m) => [m.name, m.canManage])).toEqual([
      ["Anna", true],
      ["Tulaj", false],
    ]);
    expect(asManager.canInvite).toBe(false);
    expect(asOwner.canInvite).toBe(true);
    expect(asOwner.members.find((m) => m.self)?.id).toBe(ownerMemberId);
    // The owner added Anna: that action is the owner's, not Anna's.
    expect(
      asOwner.members.find((m) => m.id === anna.id)?.lastActionAt,
    ).toBeNull();
    expect(
      asOwner.members.find((m) => m.id === ownerMemberId)?.lastActionAt,
    ).toBeInstanceOf(Date);
    expect(asOwner.devices).toEqual([
      expect.objectContaining({ barName: "Főpult" }),
    ]);
  });
});

describe("revokeDevice", () => {
  it("signs the device out once and logs it", async () => {
    const device = await StaffDevice.create({
      deviceId: "a",
      venueId,
      registeredBy: ownerUserId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await revokeDevice(manager(), venueId, String(device._id));
    const again = revokeDevice(manager(), venueId, String(device._id));

    await expect(again).rejects.toMatchObject({ status: 404 });
    expect(
      (await StaffDevice.findById(device._id).lean())?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      await AuditLog.countDocuments({ action: "staff.deviceRevoked" }),
    ).toBe(1);
  });
});

describe("revokeDevice across venues", () => {
  it("does not reach another venue's device", async () => {
    const device = await StaffDevice.create({
      deviceId: "b",
      venueId: new Types.ObjectId(),
      registeredBy: ownerUserId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const act = revokeDevice(owner(), venueId, String(device._id));

    await expect(act).rejects.toMatchObject({ status: 404 });
    expect((await StaffDevice.findById(device._id).lean())?.revokedAt).toBe(
      undefined,
    );
  });
});

describe("invites", () => {
  it("logs a sent invite and a join, and refuses joining twice", async () => {
    const userId = new Types.ObjectId().toString();
    const join = () =>
      joinVenueByInvite({
        venueId,
        userId,
        role: "manager",
        displayName: "Új Menedzser",
      });

    await recordStaffInvite(owner(), venueId, "manager");
    await join();

    await expect(join()).rejects.toMatchObject({ code: "invite_conflict" });
    expect(
      await AuditLog.find({
        action: { $in: ["staff.invited", "staff.joined"] },
      })
        .select("action actor.id")
        .lean(),
    ).toHaveLength(2);
    expect(
      await VenueMember.countDocuments({ venueId, userId, isActive: true }),
    ).toBe(1);
  });
});

describe("memberLog", () => {
  it("shows one business day of the member's own actions, 06:00 to 06:00 Budapest time", async () => {
    const anna = await VenueMember.create({
      venueId,
      role: "bartender",
      displayName: "Anna",
      pinHash: await hash("1234"),
    });
    const entry = (at: string, action: string) => ({
      actor: { type: "venue_member", id: anna._id },
      venueId,
      action,
      target: { type: "order", id: new Types.ObjectId() },
      createdAt: new Date(at),
    });
    // 2026-11-07 06:00 Budapest is 05:00 UTC.
    await AuditLog.insertMany([
      entry("2026-11-07T04:59:00Z", "order.pick_up"),
      entry("2026-11-07T05:00:00Z", "order.start_preparing"),
      entry("2026-11-08T04:59:00Z", "order.mark_ready"),
      entry("2026-11-08T05:00:00Z", "order.reject"),
    ]);

    const log = await memberLog(
      manager(),
      venueId,
      String(anna._id),
      "2026-11-07",
    );

    expect(log.entries.map((e) => e.action)).toEqual([
      "order.mark_ready",
      "order.start_preparing",
    ]);
  });

  it("does not show an Owner's log to a Manager", async () => {
    const act = memberLog(manager(), venueId, ownerMemberId, "2026-11-07");

    await expect(act).rejects.toMatchObject({ status: 403 });
  });
});
