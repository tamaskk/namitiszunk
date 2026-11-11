import "server-only";

import { randomUUID } from "node:crypto";

import {
  hitRateLimit,
  lockRateLimit,
  rateLimitLockedFor,
  undoRateLimitHit,
} from "@namitiszunk/core/api";
import { pinRoles } from "@namitiszunk/core/auth";
import { AppError, reportError } from "@namitiszunk/core/errors";
import { Bar, StaffDevice, VenueMember } from "@namitiszunk/db";
import { hash, verify } from "@node-rs/argon2";

import { isObjectId, type RequestActor } from "./actors";
import { cookieDomainFor } from "./better-auth";
import { readCookie, signValue, verifySignedValue } from "./signed-value";

export const deviceCookieName = "nmi-device";
export const staffCookieName = "nmi-staff";
const deviceTtlMs = 30 * 24 * 60 * 60 * 1000;
// One shift; an inactive or removed member is refused on the next request anyway.
const staffTtlMs = 8 * 60 * 60 * 1000;
// Spec T-030 item 4: 5 wrong PINs per minute per device, then a 5 minute lockout.
// Every attempt counts before the PIN check, so parallel guesses cannot overshoot; a correct PIN takes its hit back.
// shortcut: fixed windows (T-029 store), so up to 8 failures can straddle a window edge; sliding window if PIN abuse shows up.
const pinFailures = { limit: 4, windowSeconds: 60 };
const pinLockSeconds = 5 * 60;

type StaffActor = Extract<RequestActor, { kind: "staff" }>;
type UserActor = Extract<RequestActor, { kind: "user" }>;

/** argon2id hash of a 4-6 digit PIN, for VenueMember.pinHash (staff management T-057 and the seed). */
export function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

// Verified when the member is unknown, so the response time does not tell which member ids exist.
let dummyPinHash: Promise<string> | undefined;

/**
 * Turns a club tablet into a staff device: only a Manager or Owner of the venue may do it.
 * The caller sets the returned value as an httpOnly cookie and does not keep the manager's
 * own session on the tablet, so the bar staff never act with the manager's rights.
 */
export async function createDeviceSession(
  actor: UserActor,
  venueId: string,
  barId?: string,
  now = Date.now(),
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const allowed = actor.memberships.some(
    (m) =>
      m.venueId === venueId && (m.role === "owner" || m.role === "manager"),
  );
  if (!allowed) throw new AppError(403, "forbidden");
  // The bar name shown in Staff must be one of this venue's bars.
  if (barId && !(await Bar.exists({ _id: barId, venueId })))
    throw new AppError(404, "not_found");
  const expiresAt = now + deviceTtlMs;
  const deviceId = randomUUID();
  // Staff (T-057) lists the device and can sign it out; a cookie without this record is refused.
  await StaffDevice.create({
    deviceId,
    venueId,
    barId,
    registeredBy: actor.userId,
    expiresAt: new Date(expiresAt),
  });
  const cookieValue = signValue(
    "device",
    { deviceId, venueId, issuedBy: actor.userId },
    expiresAt,
  );
  return { cookieValue, expiresAt: new Date(expiresAt) };
}

function deviceFrom(cookieValue: string | undefined, now: number) {
  const device = verifySignedValue("device", cookieValue, now);
  if (!device?.deviceId || !device.venueId) return null;
  return { deviceId: device.deviceId, venueId: device.venueId };
}

/** False once a Manager or Owner signed the device out in Staff (T-057), or its record expired. */
async function deviceIsActive(device: { deviceId: string; venueId: string }) {
  return (
    (await StaffDevice.exists({
      deviceId: device.deviceId,
      venueId: device.venueId,
      revokedAt: { $exists: false },
    })) !== null
  );
}

/**
 * The state of this browser as a staff device: "none" (an ordinary browser), "revoked" (signed out
 * in Staff: it must forget the cookie and ask for a Manager sign-in again) or "active".
 */
export async function staffDeviceState(
  deviceCookie: string | undefined,
  now = Date.now(),
): Promise<"none" | "revoked" | "active"> {
  const device = deviceFrom(deviceCookie, now);
  if (!device) return "none";
  return (await deviceIsActive(device)) ? "active" : "revoked";
}

/**
 * Checks a member's PIN on a staff device. On success returns the staff actor and the value
 * of the short-lived staff cookie. Wrong PINs are counted per device, never per member,
 * so guessing across names hits the same limit.
 */
export async function signInStaffWithPin(
  input: { deviceCookie: string | undefined; memberId: string; pin: string },
  now = Date.now(),
): Promise<{ actor: StaffActor; cookieValue: string; expiresAt: Date }> {
  const device = deviceFrom(input.deviceCookie, now);
  if (!device || !(await deviceIsActive(device)))
    throw new AppError(401, "unauthorized");

  const bucket = `pin:${device.deviceId}`;
  if (await rateLimitLockedFor(bucket, now))
    throw new AppError(429, "pin_locked");

  if (await hitRateLimit(bucket, pinFailures, now)) {
    await lockRateLimit(bucket, pinLockSeconds, now);
    throw new AppError(429, "pin_locked");
  }
  const wellFormed = isObjectId(input.memberId) && /^\d{4,6}$/.test(input.pin);
  const member = wellFormed
    ? await VenueMember.findOne(
        {
          _id: input.memberId,
          venueId: device.venueId,
          isActive: true,
          role: { $in: pinRoles },
        },
        { role: 1, pinHash: 1 },
      ).lean()
    : null;
  const valid = await verify(
    member?.pinHash ?? (await (dummyPinHash ??= hash("000000"))),
    input.pin,
  );
  if (!member?.pinHash || !valid) throw new AppError(401, "pin_invalid");
  await undoRateLimitHit(bucket, pinFailures, now);
  // Only shown in Staff: a failed stamp must not fail the sign-in.
  await StaffDevice.updateOne(
    { deviceId: device.deviceId },
    { lastSignInAt: new Date(now) },
  ).catch(reportError);

  const expiresAt = now + staffTtlMs;
  const memberId = String(member._id);
  return {
    actor: {
      kind: "staff",
      id: `staff:${memberId}`,
      venueId: device.venueId,
      memberId,
      role: member.role,
    },
    cookieValue: signValue(
      "staff",
      { deviceId: device.deviceId, venueId: device.venueId, memberId },
      expiresAt,
    ),
    expiresAt: new Date(expiresAt),
  };
}

/**
 * True when the request carries a valid staff-device cookie. Such a browser is a shared bar
 * tablet: only its PIN holder may act there, never a member session left signed in on it
 * (SECURITY.md §03), so callers fail closed when this is true and no PIN is active.
 */
export function isStaffDevice(request: Request, now = Date.now()): boolean {
  return deviceFrom(readCookie(request, deviceCookieName), now) !== null;
}

// Signing a member in or out is all a bar tablet may do on Better Auth: the manager session left on
// it must not read the account (get-session) or change it (update-user, change-email, 2FA setup).
const staffDeviceAuthPaths =
  /^\/api\/auth\/(?:sign-out|sign-in\/[\w-]+|magic-link\/verify|callback\/[\w-]+|two-factor\/verify-[\w-]+)$/;

/** True when Better Auth may serve this request: any request off a bar tablet, only sign-in and sign-out on one. */
export function staffDeviceAllowsAuthRequest(
  request: Request,
  now = Date.now(),
): boolean {
  return (
    !isStaffDevice(request, now) ||
    staffDeviceAuthPaths.test(new URL(request.url).pathname)
  );
}

/** The active PIN holder of a staff device request, or null (401). The role is read fresh from the database. */
export async function staffActorFromRequest(
  request: Request,
  now = Date.now(),
): Promise<StaffActor | null> {
  const device = deviceFrom(readCookie(request, deviceCookieName), now);
  const staff = verifySignedValue(
    "staff",
    readCookie(request, staffCookieName),
    now,
  );
  if (
    !device ||
    !staff ||
    staff.deviceId !== device.deviceId ||
    staff.venueId !== device.venueId ||
    !isObjectId(staff.memberId) ||
    !(await deviceIsActive(device))
  )
    return null;

  const member = await VenueMember.findOne(
    {
      _id: staff.memberId,
      venueId: device.venueId,
      isActive: true,
      role: { $in: pinRoles },
    },
    { role: 1 },
  ).lean();
  if (!member) return null;
  return {
    kind: "staff",
    id: `staff:${staff.memberId}`,
    venueId: device.venueId,
    memberId: staff.memberId,
    role: member.role,
  };
}

/**
 * The device and staff cookies: httpOnly, and in production on the parent domain like the session,
 * so the bar view's calls to api.namitiszunk.hu carry the PIN holder (T-054).
 */
export function staffDeviceCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
    domain: cookieDomainFor(process.env.BETTER_AUTH_URL),
  };
}

/** The names on a bar tablet's PIN screen: active bartenders and VIP hosts of its venue with a PIN set. */
export async function listDeviceMembers(
  deviceCookie: string | undefined,
  now = Date.now(),
): Promise<{ id: string; name: string }[] | null> {
  const device = deviceFrom(deviceCookie, now);
  if (!device || !(await deviceIsActive(device))) return null;
  const members = await VenueMember.find({
    venueId: device.venueId,
    isActive: true,
    role: { $in: pinRoles },
    pinHash: { $exists: true },
  })
    .select("displayName")
    .sort({ displayName: 1 })
    .lean();
  return members.map((m) => ({ id: String(m._id), name: m.displayName }));
}
