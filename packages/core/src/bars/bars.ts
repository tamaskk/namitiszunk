import "server-only";

import { randomInt } from "node:crypto";

import { Bar, type ClientSession, QrCode, Venue, Zone } from "@namitiszunk/db";
import {
  type BarInput,
  blobUrlSchema,
  type ZoneInput,
} from "@namitiszunk/validators";

import { type Actor, requirePermission } from "../auth/permissions";
import { NotFoundError } from "../errors";
import { inTransaction, recordChange } from "../menu/admin-menu";

// Bars, zones and QR codes (T-053). A printed QR stays on a table for weeks, so it carries only a
// short code: the redirect looks up the zone's bar at scan time, and renaming a bar or moving a
// zone to another bar never means reprinting. Bars and zones are not deleted (orders point at them).

export type AdminZone = {
  id: string;
  name: string;
  type: ZoneInput["type"];
  qr: { id: string; code: string; scanCount: number } | null;
};

export type AdminBar = {
  id: string;
  name: string;
  isOpen: boolean;
  maxActiveOrders: number | null;
  zones: AdminZone[];
};

const QR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8 characters from 32 unambiguous ones: about 10^12 codes, unguessable enough for a public URL. */
export function newQrCode(): string {
  return Array.from(
    { length: 8 },
    () => QR_ALPHABET[randomInt(QR_ALPHABET.length)],
  ).join("");
}

async function requireBar(
  venueId: string,
  barId: string,
  session: ClientSession,
) {
  const bar = await Bar.findOne({ _id: barId, venueId })
    .session(session)
    .lean();
  if (!bar) throw new NotFoundError();
  return bar;
}

export async function listBars(
  actor: Actor,
  venueId: string,
): Promise<AdminBar[]> {
  requirePermission(actor, "venue.manageBars", { venueId });
  const [bars, zones, qrs] = await Promise.all([
    Bar.find({ venueId })
      .select("name isOpen maxActiveOrders")
      .sort({ _id: 1 })
      .lean(),
    Zone.find({ venueId }).select("barId name type").sort({ _id: 1 }).lean(),
    QrCode.find({ venueId, zoneId: { $ne: null } })
      .select("zoneId code scanCount")
      .lean(),
  ]);
  const qrByZone = new Map(qrs.map((q) => [String(q.zoneId), q]));
  return bars.map((bar) => ({
    id: String(bar._id),
    name: bar.name,
    isOpen: bar.isOpen ?? false,
    maxActiveOrders: bar.maxActiveOrders ?? null,
    zones: zones
      .filter((z) => z.barId.equals(bar._id))
      .map((z) => {
        const qr = qrByZone.get(String(z._id));
        return {
          id: String(z._id),
          name: z.name,
          type: z.type ?? "bar_area",
          qr: qr
            ? { id: String(qr._id), code: qr.code, scanCount: qr.scanCount }
            : null,
        };
      }),
  }));
}

export async function createBar(
  actor: Actor,
  venueId: string,
  input: BarInput,
): Promise<{ id: string }> {
  requirePermission(actor, "venue.manageBars", { venueId });
  return inTransaction(async (session) => {
    const [bar] = await Bar.create(
      [
        {
          venueId,
          name: input.name,
          isOpen: input.isOpen ?? false,
          maxActiveOrders: input.maxActiveOrders ?? undefined,
        },
      ],
      { session },
    );
    const id = String(bar!._id);
    await recordChange(session, actor, venueId, {
      action: "bars.barCreated",
      type: "bar",
      id,
      after: input,
    });
    return { id };
  });
}

export async function updateBar(
  actor: Actor,
  venueId: string,
  barId: string,
  input: BarInput,
): Promise<void> {
  requirePermission(actor, "venue.manageBars", { venueId });
  await inTransaction(async (session) => {
    const before = await requireBar(venueId, barId, session);
    const isOpen = input.isOpen ?? before.isOpen ?? false;
    // null clears the limit; a missing field keeps it, like isOpen.
    const limit = input.maxActiveOrders;
    await Bar.updateOne(
      { _id: barId, venueId },
      {
        $set: {
          name: input.name,
          isOpen,
          ...(typeof limit === "number" && { maxActiveOrders: limit }),
        },
        ...(limit === null && { $unset: { maxActiveOrders: 1 } }),
      },
      { session },
    );
    await recordChange(session, actor, venueId, {
      action: "bars.barUpdated",
      type: "bar",
      id: barId,
      before: {
        name: before.name,
        isOpen: before.isOpen,
        maxActiveOrders: before.maxActiveOrders,
      },
      after: { ...input, isOpen },
    });
  });
}

/** A new zone gets its own QR code in the same write; each VIP table is its own zone. */
export async function createZone(
  actor: Actor,
  venueId: string,
  input: ZoneInput,
): Promise<{ id: string; code: string }> {
  requirePermission(actor, "venue.manageBars", { venueId });
  // A code clash (1 in ~10^12) aborts the transaction; one retry with a new code is plenty.
  for (let attempt = 0; ; attempt++) {
    try {
      return await inTransaction(async (session) => {
        await requireBar(venueId, input.barId, session);
        const [zone] = await Zone.create([{ venueId, ...input }], { session });
        const id = String(zone!._id);
        const code = newQrCode();
        await QrCode.create([{ venueId, zoneId: id, code }], { session });
        await recordChange(session, actor, venueId, {
          action: "bars.zoneCreated",
          type: "zone",
          id,
          after: { ...input, code },
        });
        return { id, code };
      });
    } catch (error) {
      const duplicate = (error as { code?: number }).code === 11000;
      if (!duplicate || attempt > 0) throw error;
    }
  }
}

/** Renames a zone, flips sima / VIP, or moves it to another bar; its printed QR follows. */
export async function updateZone(
  actor: Actor,
  venueId: string,
  zoneId: string,
  input: ZoneInput,
): Promise<void> {
  requirePermission(actor, "venue.manageBars", { venueId });
  await inTransaction(async (session) => {
    const before = await Zone.findOne({ _id: zoneId, venueId })
      .session(session)
      .lean();
    if (!before) throw new NotFoundError();
    await requireBar(venueId, input.barId, session);
    await Zone.updateOne(
      { _id: zoneId, venueId },
      { $set: { barId: input.barId, name: input.name, type: input.type } },
      { session },
    );
    await recordChange(session, actor, venueId, {
      action: "bars.zoneUpdated",
      type: "zone",
      id: zoneId,
      before: {
        barId: String(before.barId),
        name: before.name,
        type: before.type,
      },
      after: input,
    });
  });
}

export type QrPrintData = {
  code: string;
  venueName: string;
  logoUrl: string | null;
  zoneName: string;
  barName: string;
  isVip: boolean;
};

/** What a printed card or poster shows for one QR code of the venue. */
export async function getQrPrintData(
  actor: Actor,
  venueId: string,
  qrId: string,
): Promise<QrPrintData> {
  requirePermission(actor, "venue.manageBars", { venueId });
  const qr = await QrCode.findOne({ _id: qrId, venueId })
    .select("code zoneId")
    .lean();
  if (!qr?.zoneId) throw new NotFoundError();
  const [venue, zone] = await Promise.all([
    Venue.findById(venueId).select("name branding").lean(),
    Zone.findOne({ _id: qr.zoneId, venueId }).select("barId name type").lean(),
  ]);
  if (!venue || !zone) throw new NotFoundError();
  const bar = await Bar.findOne({ _id: zone.barId, venueId })
    .select("name")
    .lean();
  if (!bar) throw new NotFoundError();
  // The PDF renderer fetches the logo on the server: only our own Blob store, never a stored
  // URL that skipped the write schema (SSRF).
  const logoUrl = venue.branding?.logoUrl;
  return {
    code: qr.code,
    venueName: venue.name,
    logoUrl: blobUrlSchema.safeParse(logoUrl).success ? logoUrl! : null,
    zoneName: zone.name,
    barName: bar.name,
    isVip: zone.type === "vip_table",
  };
}

export type QrTarget = {
  slug: string;
  barId: string | null;
  zoneId: string | null;
  code: string;
};

/**
 * A guest scanned a printed QR: returns where it points right now, or null for an unknown code or a
 * venue that is not live (its slug stays private). `count: false` resolves without counting, for a
 * repeat scan the caller has already counted. Public, no actor: the caller validates the code.
 */
export async function resolveQrScan(
  code: string,
  { count = true }: { count?: boolean } = {},
): Promise<QrTarget | null> {
  const qr = await QrCode.findOne({ code })
    .select("venueId barId zoneId")
    .lean();
  if (!qr) return null;
  const [venue, zone] = await Promise.all([
    Venue.findOne({ _id: qr.venueId, status: "active" }).select("slug").lean(),
    qr.zoneId
      ? Zone.findOne({ _id: qr.zoneId, venueId: qr.venueId })
          .select("barId")
          .lean()
      : null,
  ]);
  if (!venue) return null;
  if (count)
    await QrCode.updateOne({ _id: qr._id }, { $inc: { scanCount: 1 } });
  const barId = zone?.barId ?? qr.barId;
  return {
    slug: venue.slug,
    barId: barId ? String(barId) : null,
    zoneId: zone ? String(zone._id) : null,
    code,
  };
}
