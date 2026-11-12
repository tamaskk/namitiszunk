import { AuditLog, connectDb, Venue } from "@namitiszunk/db";
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
import { getVenueSettings, updateVenueSettings } from "./settings";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_settings_test"));
  await Promise.all([Venue, AuditLog].map((m) => m.createCollection()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

let venueId: string;

const member = (role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [{ venueId, memberId: "m", role }],
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
  const venue = await Venue.create({
    name: "Klub",
    slug: `klub-${new Types.ObjectId()}`,
    company: { name: "Klub Kft.", taxNumber: "12345678-2-42" },
  });
  venueId = String(venue._id);
});

const orderTab = {
  tab: "order" as const,
  autoAccept: true,
  pickupDeadlineMinutes: 30,
  refundOnExpiry: false,
  maxItemsPerOrder: 10,
  minimumOrderHuf: 0,
  lastOrderMinutesBeforeClose: 15,
  serviceFee: { type: "fixed" as const, value: 300 },
  tips: { enabled: true, presetsBps: [800, 1200, 2000] },
};

describe("getVenueSettings", () => {
  it("fills unset fields with the defaults the order app uses", async () => {
    const settings = await getVenueSettings(member("owner"), venueId);

    expect(settings.order).toMatchObject({
      pickupDeadlineMinutes: 30,
      maxItemsPerOrder: 10,
      serviceFee: { type: "none", value: 0 },
      tips: { enabled: true, presetsBps: [500, 1000, 1500] },
    });
    expect(settings.branding).toMatchObject({
      accentColor: "",
      accentReadable: true,
    });
  });

  it("refuses a Manager", async () => {
    const act = () => getVenueSettings(member("manager"), venueId);

    await expect(act()).rejects.toMatchObject({ status: 403 });
  });
});

describe("updateVenueSettings", () => {
  it("saves the order rules, logs the tab before and after, and bumps the menu version", async () => {
    const saved = await updateVenueSettings(member("owner"), venueId, orderTab);

    const venue = await Venue.findById(venueId).lean();
    const log = await AuditLog.findOne({
      action: "venue.settingsUpdated",
    }).lean();
    expect(saved.order.serviceFee).toEqual({ type: "fixed", value: 300 });
    expect(venue?.orderRules?.tips?.presetsBps).toEqual([800, 1200, 2000]);
    expect(venue?.menuVersion).toBe(1);
    expect(log?.before).toMatchObject({
      order: { serviceFee: { type: "none" } },
    });
    expect(log?.after).toMatchObject({
      order: { serviceFee: { type: "fixed", value: 300 } },
    });
  });

  it("clears an emptied field instead of storing an empty string", async () => {
    await updateVenueSettings(member("owner"), venueId, {
      tab: "basics",
      name: "Új Klub",
      address: { street: "Fő utca 1.", city: "Budapest", postalCode: "1011" },
      company: { name: "Klub Kft.", taxNumber: "" },
      contactEmail: "",
    });

    const venue = await Venue.findById(venueId).lean();
    expect(venue?.name).toBe("Új Klub");
    expect(venue?.company?.taxNumber).toBeUndefined();
    expect(venue?.address?.postalCode).toBe("1011");
  });

  it("keeps an unreadable accent but tells the form the guest pages ignore it", async () => {
    const saved = await updateVenueSettings(member("owner"), venueId, {
      tab: "branding",
      logoUrl: "",
      coverUrl: "",
      accentColor: "#1e3a8a",
    });

    expect(saved.branding).toEqual({
      logoUrl: "",
      coverUrl: "",
      accentColor: "#1e3a8a",
      accentReadable: false,
    });
  });

  it("refuses a logo from another store or another venue's folder", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_abc123_secret");
    const ours = `https://abc123.public.blob.vercel-storage.com/venues/${venueId}/venue/0b9c4c2e-8a1d-4f6e-9f0a-1c2d3e4f5a6b`;
    const branding = (logoUrl: string) => ({
      tab: "branding" as const,
      logoUrl,
      coverUrl: "",
      accentColor: "",
    });

    // Thunks: each save starts only when its rejection is awaited (no unhandled rejection).
    const foreign = () =>
      updateVenueSettings(
        member("owner"),
        venueId,
        branding("https://evil.public.blob.vercel-storage.com/x.png"),
      );
    const otherVenue = () =>
      updateVenueSettings(
        member("owner"),
        venueId,
        branding(ours.replace(venueId, new Types.ObjectId().toString())),
      );

    await expect(foreign()).rejects.toMatchObject({
      fields: { logoUrl: "validation.url.invalid" },
    });
    await expect(otherVenue()).rejects.toMatchObject({ status: 400 });
    const saved = await updateVenueSettings(
      member("owner"),
      venueId,
      branding(ours),
    );
    expect(saved.branding.logoUrl).toBe(ours);
    vi.unstubAllEnvs();
  });

  it("notes a changed contact e-mail in the log without the address", async () => {
    await updateVenueSettings(member("owner"), venueId, {
      tab: "basics",
      name: "Klub",
      address: { street: "", city: "", postalCode: "" },
      company: { name: "", taxNumber: "" },
      contactEmail: "uj@klub.hu",
    });

    const log = await AuditLog.findOne().lean();
    expect(log?.after).toMatchObject({ changed: ["contactEmail"] });
    expect(JSON.stringify(log)).not.toContain("uj@klub.hu");
  });

  it("stores the tip presets smallest first", async () => {
    const saved = await updateVenueSettings(member("owner"), venueId, {
      ...orderTab,
      tips: { enabled: true, presetsBps: [2000, 800, 1200] },
    });

    expect(saved.order.tips.presetsBps).toEqual([800, 1200, 2000]);
  });

  it("stores the opening hours by day, and none means the bar switch decides", async () => {
    await updateVenueSettings(member("owner"), venueId, {
      tab: "hours",
      businessDayStart: "06:00",
      openingHours: [
        { day: 6, open: "22:00", close: "05:00" },
        { day: 5, open: "22:00", close: "05:00" },
      ],
    });
    const withHours = await Venue.findById(venueId).lean();

    await updateVenueSettings(member("owner"), venueId, {
      tab: "hours",
      businessDayStart: "06:00",
      openingHours: [],
    });

    expect(withHours?.openingHours?.map((h) => h.day)).toEqual([5, 6]);
    expect((await Venue.findById(venueId).lean())?.openingHours).toBe(
      undefined,
    );
  });

  it("refuses a Manager and leaves the venue as it was", async () => {
    const act = () => updateVenueSettings(member("manager"), venueId, orderTab);

    await expect(act()).rejects.toMatchObject({ status: 403 });
    expect((await Venue.findById(venueId).lean())?.menuVersion).toBe(0);
  });
});
