import "server-only";

import {
  getAuth,
  isStaffDevice,
  userActorFromHeaders,
} from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import { redirect } from "next/navigation";

import { ensureDb } from "@/lib/db";

/**
 * The signed-in Admin session an invite is accepted with, under the rules of every Admin page:
 * a bar tablet only takes PINs, and a session waiting for its 2FA code counts for nothing yet.
 */
export async function inviteSession(requestHeaders: Headers) {
  if (
    isStaffDevice(
      new Request("http://admin.local", { headers: requestHeaders }),
    )
  )
    redirect("/pin");
  await ensureDb();
  const auth = await getAuth("admin");
  try {
    if (!(await userActorFromHeaders(auth, "admin", requestHeaders)))
      return null;
  } catch (error) {
    if (error instanceof AppError && error.code === "two_factor_required")
      redirect("/sign-in?step=2fa");
    throw error;
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session && { auth, session };
}
