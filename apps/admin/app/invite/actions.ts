"use server";

import { acceptStaffInvite } from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { VENUE_COOKIE } from "@/lib/admin-context";

import { inviteSession } from "./invite-session";

/**
 * Accepts a Manager or Owner invite (T-057) for the signed-in user, then opens that venue.
 * A POST, not the link itself, so a prefetched or scanned e-mail link never accepts anything.
 */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const signedIn = await inviteSession(await headers());
  if (!signedIn) redirect(`/sign-in?invite=${encodeURIComponent(token)}`);
  const { auth, session } = signedIn;

  let venueId: string;
  try {
    ({ venueId } = await acceptStaffInvite(
      auth,
      {
        userId: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        name: session.user.name,
      },
      token,
    ));
  } catch (error) {
    if (error instanceof AppError)
      redirect(`/invite?error=${encodeURIComponent(error.code)}`);
    throw error;
  }
  (await cookies()).set(VENUE_COOKIE, venueId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
