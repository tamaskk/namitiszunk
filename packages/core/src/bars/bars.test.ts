import { AuditLog, Bar, connectDb, QrCode, Venue, Zone } from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomInt } from "node:crypto";
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
import { resolveMenuContext } from "../menu/public-menu";
import {
  createBar,
  createZone,
  getQrPrintData,
  listBars,
  newQrCode,
  resolveQrScan,
  updateBar,
  updateZone,
} from "./bars";

vi.mock("server-only", () => ({}));
// Randomness is a boundary: the code-clash test pins it.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_bars_test"));
  await Promise.all(
    [Venue, Bar, Zone, QrCode, AuditLog].map((m) => m.createCollection()),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  vi.mocked(randomInt).mockRestore?.();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

const member = (venueId: string, role: VenueRole): Actor => ({
  kind: "user",
  userId: new Types.ObjectId().toString(),
  memberships: [{ venueId, memberId: new Types.ObjectId().toString(), role }],
});

async function seed() {
  const [venue] = await Venue.create([
    { slug: "pilot", name: "Pilot", status: "active" },
  ]);
  const venueId = String(venue!._id);
  const manager = member(venueId, "manager");
  const { id: barId } = await createBar(manager, venueId, {
    name: "Főpult",
    isOpen: true,
  });
  return { venueId, manager, barId };
}

describe("newQrCode", () => {
  it("makes 8 unambiguous characters", () => {
    const codes = Array.from({ length: 50 }, newQrCode);

    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});

describe("bars and zones", () => {
  it("creates a zone with its own QR code and lists it under its bar", async () => {
    const { venueId, manager, barId } = await seed();

    const { code } = await createZone(manager, venueId, {
      barId,
      name: "VIP 1",
      type: "vip_table",
    });
    const bars = await listBars(manager, venueId);

    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ name: "Főpult", isOpen: true });
    expect(bars[0]!.zones).toEqual([
      {
        id: expect.any(String),
        name: "VIP 1",
        type: "vip_table",
        qr: { id: expect.any(String), code, scanCount: 0 },
      },
    ]);
    expect(await AuditLog.countDocuments({ action: "bars.zoneCreated" })).toBe(
      1,
    );
  });

  it("clears the active order limit when it is set to null", async () => {
    const { venueId, manager, barId } = await seed();
    await updateBar(manager, venueId, barId, {
      name: "Főpult",
      maxActiveOrders: 20,
    });

    await updateBar(manager, venueId, barId, {
      name: "Hátsó pult",
      maxActiveOrders: null,
    });

    const bar = await Bar.findById(barId).lean();
    expect(bar).toMatchObject({ name: "Hátsó pult", isOpen: true });
    expect(bar?.maxActiveOrders).toBeUndefined();
  });

  it("refuses a bartender and a zone on another venue's bar", async () => {
    const { venueId, manager } = await seed();
    const [other] = await Bar.create([
      { venueId: new Types.ObjectId(), name: "Más" },
    ]);

    await expect(
      listBars(member(venueId, "bartender"), venueId),
    ).rejects.toThrow();
    await expect(
      createZone(manager, venueId, {
        barId: String(other!._id),
        name: "X",
        type: "bar_area",
      }),
    ).rejects.toThrow();
  });
});

describe("resolveQrScan", () => {
  it("counts every scan by one", async () => {
    const { venueId, manager, barId } = await seed();
    const { code } = await createZone(manager, venueId, {
      barId,
      name: "Terasz",
      type: "bar_area",
    });

    await resolveQrScan(code);
    await resolveQrScan(code);
    await resolveQrScan(code);

    expect((await QrCode.findOne({ code }).lean())?.scanCount).toBe(3);
  });

  it("follows a renamed bar and a zone moved to another bar without a new code", async () => {
    const { venueId, manager, barId } = await seed();
    const { id: zoneId, code } = await createZone(manager, venueId, {
      barId,
      name: "VIP 1",
      type: "vip_table",
    });
    const { id: otherBarId } = await createBar(manager, venueId, {
      name: "Galéria",
    });

    await updateBar(manager, venueId, barId, { name: "Új név" });
    await updateZone(manager, venueId, zoneId, {
      barId: otherBarId,
      name: "VIP 1",
      type: "vip_table",
    });
    const target = await resolveQrScan(code);

    expect(target).toEqual({
      slug: "pilot",
      barId: otherBarId,
      zoneId,
      code,
    });
  });

  it("opens VIP items only from a VIP table's code", async () => {
    const { venueId, manager, barId } = await seed();
    const vip = await createZone(manager, venueId, {
      barId,
      name: "VIP 1",
      type: "vip_table",
    });
    const plain = await createZone(manager, venueId, {
      barId,
      name: "Tánctér",
      type: "bar_area",
    });

    const vipTarget = await resolveQrScan(vip.code);
    const plainTarget = await resolveQrScan(plain.code);

    const contextOf = (t: typeof vipTarget) =>
      resolveMenuContext({
        slug: t!.slug,
        barId: t!.barId ?? undefined,
        zoneId: t!.zoneId ?? undefined,
      });
    expect((await contextOf(vipTarget))?.isVip).toBe(true);
    expect((await contextOf(plainTarget))?.isVip).toBe(false);
  });

  it("returns null for an unknown code", async () => {
    await seed();

    const target = await resolveQrScan("ZZZZZZZZ");

    expect(target).toBeNull();
  });
});

describe("getQrPrintData", () => {
  it("gives the card's texts and refuses another venue's code", async () => {
    const { venueId, manager, barId } = await seed();
    const { code } = await createZone(manager, venueId, {
      barId,
      name: "VIP 2",
      type: "vip_table",
    });
    const qr = await QrCode.findOne({ code }).lean();
    const stranger = member(new Types.ObjectId().toString(), "owner");

    const data = await getQrPrintData(manager, venueId, String(qr!._id));

    expect(data).toEqual({
      code,
      venueName: "Pilot",
      logoUrl: null,
      zoneName: "VIP 2",
      barName: "Főpult",
      isVip: true,
    });
    await expect(
      getQrPrintData(stranger, venueId, String(qr!._id)),
    ).rejects.toThrow();
  });
});

describe("review fixes", () => {
  it("keeps the active order limit when the field is left out", async () => {
    const { venueId, manager, barId } = await seed();
    await updateBar(manager, venueId, barId, {
      name: "Főpult",
      maxActiveOrders: 20,
    });

    await updateBar(manager, venueId, barId, { name: "Főpult" });

    expect((await Bar.findById(barId).lean())?.maxActiveOrders).toBe(20);
  });

  it("does not resolve or count a code of a venue that is not live", async () => {
    const { venueId, manager, barId } = await seed();
    const { code } = await createZone(manager, venueId, {
      barId,
      name: "Terasz",
      type: "bar_area",
    });
    await Venue.updateOne({ _id: venueId }, { status: "suspended" });

    const target = await resolveQrScan(code);

    expect(target).toBeNull();
    expect((await QrCode.findOne({ code }).lean())?.scanCount).toBe(0);
  });

  it("resolves a repeat scan without counting it", async () => {
    const { venueId, manager, barId } = await seed();
    const { code } = await createZone(manager, venueId, {
      barId,
      name: "Terasz",
      type: "bar_area",
    });

    const target = await resolveQrScan(code, { count: false });

    expect(target?.slug).toBe("pilot");
    expect((await QrCode.findOne({ code }).lean())?.scanCount).toBe(0);
  });

  it("prints a logo only from the venue's Blob store", async () => {
    const { venueId, manager, barId } = await seed();
    const { code } = await createZone(manager, venueId, {
      barId,
      name: "VIP 3",
      type: "vip_table",
    });
    const qrId = String((await QrCode.findOne({ code }).lean())!._id);
    const blob = "https://abc123.public.blob.vercel-storage.com/logo.png";

    await Venue.updateOne(
      { _id: venueId },
      { branding: { logoUrl: "http://169.254.169.254/latest" } },
    );
    const internal = await getQrPrintData(manager, venueId, qrId);
    await Venue.updateOne({ _id: venueId }, { branding: { logoUrl: blob } });
    const own = await getQrPrintData(manager, venueId, qrId);

    expect(internal.logoUrl).toBeNull();
    expect(own.logoUrl).toBe(blob);
  });

  it("retries a clashing QR code once and leaves no zone behind when both clash", async () => {
    const { venueId, manager, barId } = await seed();
    vi.mocked(randomInt).mockReturnValue(0 as never);
    const first = await createZone(manager, venueId, {
      barId,
      name: "A",
      type: "bar_area",
    });

    await expect(
      createZone(manager, venueId, { barId, name: "B", type: "bar_area" }),
    ).rejects.toMatchObject({ code: 11000 });
    // The first attempt clashes again (8 zeros), the retry draws "B" for every character.
    let draws = 0;
    vi.mocked(randomInt).mockImplementation((() =>
      draws++ < 8 ? 0 : 1) as never);
    const third = await createZone(manager, venueId, {
      barId,
      name: "C",
      type: "bar_area",
    });

    expect(first.code).toBe("AAAAAAAA");
    expect(third.code).toBe("BBBBBBBB");
    expect(await Zone.countDocuments({ venueId })).toBe(2);
  });
});
