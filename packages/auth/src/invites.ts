import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { requirePermission } from "@namitiszunk/core/auth";
import { AppError, ConflictError } from "@namitiszunk/core/errors";
import { VenueMember } from "@namitiszunk/db";
import { sendEmail } from "@namitiszunk/emails";
import type { Locale } from "@namitiszunk/i18n";

import type { RequestActor } from "./actors";
import type { Auth } from "./better-auth";

const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
// Fixed here, never taken from the caller, so an invite e-mail cannot link to another site.
// shortcut: local and preview invites also link to production Admin; read the Admin URL from config if staff management (T-057) needs local invites.
export const inviteAcceptUrl = "https://admin.namitiszunk.hu/invite";
type InviteRole = "manager" | "owner";

// Invites live in Better Auth's verification collection under a hashed identifier: no new collection.
const identifierFor = (token: string) =>
  `invite:${createHash("sha256").update(token).digest("hex")}`;

type InvitePayload = { venueId: string; role: InviteRole; email: string };

function parsePayload(value: string): InvitePayload | null {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) return null;
  const { venueId, role, email } = parsed as Record<string, unknown>;
  if (typeof venueId !== "string" || typeof email !== "string") return null;
  if (role !== "manager" && role !== "owner") return null;
  return { venueId, role, email };
}

/**
 * Sends a one-time, 7-day invite for a Manager or Owner. The token exists only in the e-mail;
 * the database keeps its hash. Who may invite whom is the RBAC rule `staff.invite`.
 */
export async function createStaffInvite(
  auth: Auth,
  actor: RequestActor,
  invite: {
    venueId: string;
    venueName: string;
    email: string;
    role: InviteRole;
    locale: Locale;
  },
  now = Date.now(),
): Promise<void> {
  requirePermission(actor, "staff.invite", {
    venueId: invite.venueId,
    targetRole: invite.role,
  });
  const token = randomBytes(32).toString("base64url");
  const email = invite.email.trim().toLowerCase();
  const ctx = await auth.$context;
  await ctx.internalAdapter.createVerificationValue({
    identifier: identifierFor(token),
    value: JSON.stringify({
      venueId: invite.venueId,
      role: invite.role,
      email,
    }),
    expiresAt: new Date(now + inviteTtlMs),
  });
  const url = new URL(inviteAcceptUrl);
  url.searchParams.set("token", token);
  await sendEmail("staffInvite", email, {
    venueName: invite.venueName,
    role: invite.role,
    url: url.toString(),
    locale: invite.locale,
  });
}

/**
 * Accepts an invite for the signed-in user whose e-mail it was sent to, and creates the venue
 * membership. The invite is deleted on success, so it works once; expired, used or unknown
 * tokens all give the same 404.
 */
export async function acceptStaffInvite(
  auth: Auth,
  user: {
    userId: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
  },
  token: string,
  now = Date.now(),
): Promise<{ venueId: string; role: InviteRole }> {
  const invalid = new AppError(404, "invite_invalid");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid;
  const ctx = await auth.$context;
  const identifier = identifierFor(token);

  const found = await ctx.internalAdapter.findVerificationValue(identifier);
  const payload = found && parsePayload(found.value);
  // A forwarded link must not let another account join the venue, nor an unproven address claim it.
  if (
    !payload ||
    !user.emailVerified ||
    found.expiresAt.getTime() <= now ||
    payload.email !== user.email.trim().toLowerCase()
  )
    throw invalid;

  try {
    await VenueMember.create({
      venueId: payload.venueId,
      userId: user.userId,
      role: payload.role,
      displayName: user.name?.trim() || payload.email,
    });
  } catch (error) {
    // The user is already a member, or the display name is taken in this venue.
    if ((error as { code?: unknown }).code === 11000)
      throw new ConflictError("invite_conflict");
    throw error;
  }
  // A concurrent second accept by the same user already failed on the unique membership index.
  await ctx.internalAdapter.consumeVerificationValue(identifier);
  return { venueId: payload.venueId, role: payload.role };
}
