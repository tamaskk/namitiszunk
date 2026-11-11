import "server-only";

import { TZDate } from "@date-fns/tz";
import {
  AuditLog,
  Bar,
  StaffDevice,
  Types,
  Venue,
  VenueMember,
} from "@namitiszunk/db";
import { hash, verify } from "@node-rs/argon2";
import type { ClientSession } from "mongoose";

import { hitRateLimit } from "../api/rate-limit";
import { audit, auditActorOf } from "../audit/audit";
import {
  type Actor,
  can,
  pinRoles,
  requirePermission,
  type VenueRole,
} from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { inTransaction } from "../menu/admin-menu";
import { businessDate } from "../orders/business-date";

export type StaffRow = {
  id: string;
  name: string;
  role: VenueRole;
  active: boolean;
  /** Bartenders and VIP hosts sign in with a PIN; owners and managers with their own account. */
  usesPin: boolean;
  lastActionAt: Date | null;
  /** The signed-in user's own row: it cannot be disabled from here. */
  self: boolean;
  /** Whether this actor may change the PIN of, disable or enable this member. */
  canManage: boolean;
};

export type DeviceRow = {
  id: string;
  /** null: the VIP host's phone. */
  barName: string | null;
  registeredAt: Date;
  lastSignInAt: Date | null;
};

export type StaffLogEntry = {
  id: string;
  at: Date;
  action: string;
  target: { type: string; id: string };
};

// The Staff module's own check: what a Manager may do (add a bartender) opens the page.
const viewStaff = (actor: Actor, venueId: string) =>
  requirePermission(actor, "staff.invite", {
    venueId,
    targetRole: "bartender",
  });

const mayManage = (actor: Actor, venueId: string, role: VenueRole) =>
  can(actor, "staff.invite", { venueId, targetRole: role });

function isSelf(
  actor: Actor,
  member: { _id: unknown; userId?: unknown },
): boolean {
  if (actor.kind === "staff") return actor.memberId === String(member._id);
  if (actor.kind === "user")
    return member.userId != null && actor.userId === String(member.userId);
  return false;
}

/** The members (active first, by name) and the signed-in staff devices of a venue. */
export async function listStaff(
  actor: Actor,
  venueId: string,
): Promise<{
  members: StaffRow[];
  devices: DeviceRow[];
  canInvite: boolean;
}> {
  viewStaff(actor, venueId);
  const [members, devices] = await Promise.all([
    VenueMember.find({ venueId })
      .select("displayName role isActive userId")
      .sort({ isActive: -1, displayName: 1 })
      .lean(),
    StaffDevice.find({
      venueId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .select("barId createdAt lastSignInAt")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // A PIN holder is logged by member id, an account by user id (auditActorOf).
  const actorIds = members.flatMap((m) =>
    m.userId ? [m.userId, m._id] : [m._id],
  );
  const [last, bars] = await Promise.all([
    AuditLog.aggregate<{ _id: unknown; at: Date }>([
      {
        $match: {
          venueId: new Types.ObjectId(venueId),
          "actor.id": { $in: actorIds },
        },
      },
      { $group: { _id: "$actor.id", at: { $max: "$createdAt" } } },
    ]),
    Bar.find({
      venueId,
      _id: { $in: devices.flatMap((d) => (d.barId ? [d.barId] : [])) },
    })
      .select("name")
      .lean(),
  ]);
  const lastBy = new Map(last.map((l) => [String(l._id), l.at]));
  const barName = new Map(bars.map((b) => [String(b._id), b.name]));

  return {
    members: members.map((m) => {
      const times = [lastBy.get(String(m._id)), lastBy.get(String(m.userId))]
        .filter((at): at is Date => at instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime());
      return {
        id: String(m._id),
        name: m.displayName,
        role: m.role,
        active: m.isActive,
        usesPin: pinRoles.includes(m.role),
        lastActionAt: times[0] ?? null,
        self: isSelf(actor, m),
        canManage: !isSelf(actor, m) && mayManage(actor, venueId, m.role),
      };
    }),
    devices: devices.map((d) => ({
      id: String(d._id),
      barName: d.barId ? (barName.get(String(d.barId)) ?? null) : null,
      registeredAt: d.createdAt,
      lastSignInAt: d.lastSignInAt ?? null,
    })),
    canInvite: mayManage(actor, venueId, "manager"),
  };
}

/**
 * A PIN must not open two members' names in one venue (T-057): the log and the bartender report
 * would mix them up. Hashes are salted, so each one is checked; disabled members count too, so
 * enabling one again cannot create a clash.
 */
async function assertPinFree(
  session: ClientSession,
  venueId: string,
  pin: string,
  exceptMemberId?: string,
): Promise<void> {
  // Two PIN writes in one venue touch the same venue document, so the second transaction hits a
  // write conflict, retries and sees the first one's PIN.
  await Venue.updateOne(
    { _id: venueId },
    { $currentDate: { updatedAt: true } },
    { session },
  );
  const holders = await VenueMember.find({
    venueId,
    pinHash: { $exists: true },
    ...(exceptMemberId && { _id: { $ne: exceptMemberId } }),
  })
    .select("+pinHash")
    .session(session)
    .lean();
  for (const holder of holders)
    if (holder.pinHash && (await verify(holder.pinHash, pin)))
      throw new ConflictError("pin_taken");
}

async function loadMember(venueId: string, memberId: string) {
  const member = await VenueMember.findOne({ _id: memberId, venueId })
    .select("displayName role isActive userId")
    .lean();
  if (!member) throw new NotFoundError();
  return member;
}

const PIN_WRITE_RATE = { limit: 10, windowSeconds: 60 };

/** A "PIN taken" answer tells which PINs exist, and each check runs every argon2 hash: few per minute. */
async function limitPinWrites(actor: Actor): Promise<void> {
  if (
    await hitRateLimit(
      `staff-pin:${JSON.stringify(auditActorOf(actor))}`,
      PIN_WRITE_RATE,
    )
  )
    throw new AppError(429, "rate_limited");
}

const nameTaken = (error: unknown) =>
  (error as { code?: unknown }).code === 11000
    ? new ConflictError("staff_name_taken")
    : error;

/** A bartender or VIP host: a name and a 4-digit PIN, no e-mail account. */
export async function addPinMember(
  actor: Actor,
  venueId: string,
  input: { name: string; role: "bartender" | "vip_host"; pin: string },
): Promise<{ id: string }> {
  requirePermission(actor, "staff.invite", {
    venueId,
    targetRole: input.role,
  });
  await limitPinWrites(actor);
  const pinHash = await hash(input.pin);
  try {
    return await inTransaction(async (session) => {
      await assertPinFree(session, venueId, input.pin);
      const [member] = await VenueMember.create(
        [{ venueId, role: input.role, displayName: input.name, pinHash }],
        { session },
      );
      const id = String(member!._id);
      await audit(session, {
        actor: auditActorOf(actor),
        venueId,
        action: "staff.added",
        target: { type: "venue_member", id },
        after: { name: input.name, role: input.role },
      });
      return { id };
    });
  } catch (error) {
    throw nameTaken(error);
  }
}

/** A new PIN for a bartender or VIP host; the old one stops working at once. */
export async function changeMemberPin(
  actor: Actor,
  venueId: string,
  memberId: string,
  pin: string,
): Promise<void> {
  const member = await loadMember(venueId, memberId);
  if (!pinRoles.includes(member.role)) throw new NotFoundError();
  requirePermission(actor, "staff.invite", {
    venueId,
    targetRole: member.role,
  });
  await limitPinWrites(actor);
  const pinHash = await hash(pin);
  await inTransaction(async (session) => {
    await assertPinFree(session, venueId, pin, memberId);
    await VenueMember.updateOne({ _id: memberId }, { pinHash }, { session });
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "staff.pinChanged",
      target: { type: "venue_member", id: memberId },
    });
  });
}

/**
 * Disables or enables a member. A disabled member's PIN and sessions stop on their next request
 * (sign-in and every staff or member request read `isActive`); their log entries stay.
 */
export async function setMemberActive(
  actor: Actor,
  venueId: string,
  memberId: string,
  active: boolean,
): Promise<void> {
  const member = await loadMember(venueId, memberId);
  requirePermission(actor, "staff.invite", {
    venueId,
    targetRole: member.role,
  });
  // Nobody locks themselves out; another owner can do it.
  if (isSelf(actor, member)) throw new AppError(403, "staff_self");
  if (member.isActive === active) return;
  try {
    await inTransaction(async (session) => {
      if (!active && member.role === "owner") {
        // Two owners disabling each other at once: the venue document serialises them.
        await Venue.updateOne(
          { _id: venueId },
          { $currentDate: { updatedAt: true } },
          { session },
        );
        const others = await VenueMember.countDocuments({
          venueId,
          role: "owner",
          isActive: true,
          _id: { $ne: memberId },
        }).session(session);
        if (others === 0) throw new ConflictError("staff_last_owner");
      }
      await VenueMember.updateOne(
        { _id: memberId },
        { isActive: active },
        { session },
      );
      await audit(session, {
        actor: auditActorOf(actor),
        venueId,
        action: active ? "staff.enabled" : "staff.disabled",
        target: { type: "venue_member", id: memberId },
      });
    });
  } catch (error) {
    // Enabling again: an active member now has the same name.
    throw nameTaken(error);
  }
}

const LOG_LIMIT = 500;

/** What one member did on one business day, from the audit log (T-026). */
export async function memberLog(
  actor: Actor,
  venueId: string,
  memberId: string,
  date: string | undefined,
  now = new Date(),
): Promise<{
  member: { id: string; name: string; role: VenueRole; active: boolean };
  businessDate: string;
  entries: StaffLogEntry[];
  /** More than LOG_LIMIT entries that day: only the latest are shown. */
  truncated: boolean;
}> {
  viewStaff(actor, venueId);
  const [member, venue] = await Promise.all([
    loadMember(venueId, memberId),
    Venue.findById(venueId).select("timezone businessDayStart").lean(),
  ]);
  // A Manager reads their own log and the logs of the members they manage, not an Owner's.
  if (!isSelf(actor, member))
    requirePermission(actor, "staff.invite", {
      venueId,
      targetRole: member.role,
    });
  const day = {
    timezone: venue?.timezone ?? "Europe/Budapest",
    businessDayStart: venue?.businessDayStart ?? "06:00",
  };
  const date_ = date ?? businessDate(now, day);
  const [y, m, d] = date_.split("-").map(Number) as [number, number, number];
  const [h = 0, min = 0] = day.businessDayStart.split(":").map(Number);
  const from = new TZDate(y, m - 1, d, h, min, day.timezone);
  const to = new TZDate(y, m - 1, d + 1, h, min, day.timezone);

  const entries = await AuditLog.find({
    venueId,
    "actor.id": {
      $in: member.userId ? [member.userId, member._id] : [member._id],
    },
    createdAt: { $gte: from, $lt: to },
  })
    .select("_id action target createdAt")
    .sort({ createdAt: -1 })
    .limit(LOG_LIMIT + 1)
    .lean();
  return {
    member: {
      id: String(member._id),
      name: member.displayName,
      role: member.role,
      active: member.isActive,
    },
    businessDate: date_,
    truncated: entries.length > LOG_LIMIT,
    entries: entries.slice(0, LOG_LIMIT).map((e) => ({
      id: String(e._id),
      at: e.createdAt,
      action: e.action,
      target: { type: e.target?.type ?? "", id: String(e.target?.id ?? "") },
    })),
  };
}

/** Logs a sent Manager or Owner invite (T-057); the invited address stays out of the log. */
export async function recordStaffInvite(
  actor: Actor,
  venueId: string,
  role: "manager" | "owner",
): Promise<void> {
  await inTransaction((session) =>
    audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "staff.invited",
      target: { type: "venue", id: venueId },
      after: { role },
    }),
  );
}

/** An accepted invite: the membership and its log entry commit together. */
export async function joinVenueByInvite(join: {
  venueId: string;
  userId: string;
  role: "manager" | "owner";
  displayName: string;
}): Promise<void> {
  try {
    await inTransaction(async (session) => {
      const [member] = await VenueMember.create(
        [
          {
            venueId: join.venueId,
            userId: join.userId,
            role: join.role,
            displayName: join.displayName,
          },
        ],
        { session },
      );
      await audit(session, {
        actor: { type: "user", id: join.userId },
        venueId: join.venueId,
        action: "staff.joined",
        target: { type: "venue_member", id: String(member!._id) },
        after: { role: join.role },
      });
    });
  } catch (error) {
    // The user is already a member, or the display name is taken in this venue.
    if ((error as { code?: unknown }).code === 11000)
      throw new ConflictError("invite_conflict");
    throw error;
  }
}

/** Signs a bar tablet or VIP phone out: its PIN screen asks for a Manager sign-in again. */
export async function revokeDevice(
  actor: Actor,
  venueId: string,
  deviceId: string,
  now = new Date(),
): Promise<void> {
  viewStaff(actor, venueId);
  await inTransaction(async (session) => {
    const device = await StaffDevice.findOneAndUpdate(
      { _id: deviceId, venueId, revokedAt: { $exists: false } },
      { revokedAt: now },
      { session },
    );
    if (!device) throw new NotFoundError();
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "staff.deviceRevoked",
      target: { type: "staff_device", id: deviceId },
    });
  });
}
