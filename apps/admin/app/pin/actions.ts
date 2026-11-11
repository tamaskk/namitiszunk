"use server";

import {
  deviceCookieName,
  getAuth,
  signInStaffWithPin,
  staffCookieName,
  staffDeviceCookieOptions,
  staffDeviceState,
} from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import { devicePinSignInInputSchema } from "@namitiszunk/validators";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ensureDb } from "@/lib/db";
import { DEVICE_BAR_COOKIE } from "@/lib/staff-device";

export type PinActionResult = { error: { code: string } };

/** A bartender's name and PIN on the bar tablet (T-054): the PIN holder becomes the actor for one shift. */
export async function signInWithPinAction(
  input: unknown,
): Promise<PinActionResult> {
  const parsed = devicePinSignInInputSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "pin_invalid" } };
  await ensureDb();
  const jar = await cookies();
  let staff: Awaited<ReturnType<typeof signInStaffWithPin>>;
  try {
    staff = await signInStaffWithPin({
      deviceCookie: jar.get(deviceCookieName)?.value,
      memberId: parsed.data.memberId,
      pin: parsed.data.pin,
    });
    jar.set(
      staffCookieName,
      staff.cookieValue,
      staffDeviceCookieOptions(staff.expiresAt),
    );
  } catch (error) {
    if (error instanceof AppError) return { error: { code: error.code } };
    throw error;
  }
  // The VIP host's phone opens the VIP list; a bartender's tablet opens the bar view.
  redirect(staff.actor.role === "vip_host" ? "/vip" : "/pult");
}

/** "Pultosváltás": the PIN holder steps away; the next one taps their name. */
export async function switchStaffAction(): Promise<void> {
  const jar = await cookies();
  const { domain } = staffDeviceCookieOptions(new Date(0));
  jar.delete({ name: staffCookieName, path: "/", domain });
  redirect("/pin");
}

/**
 * A tablet signed out in Staff (T-057) forgets it was a staff device and ends the member session
 * left on it, so only a fresh Manager or Owner sign-in can set it up again. An active tablet
 * cannot use this: a PIN holder must not be able to un-register it.
 */
export async function forgetRevokedDeviceAction(): Promise<void> {
  await ensureDb();
  const jar = await cookies();
  if ((await staffDeviceState(jar.get(deviceCookieName)?.value)) !== "revoked")
    redirect("/pin");
  // The member session goes first, and must be gone: a tablet without its device cookie but with a
  // live Manager session would act as that Manager (SECURITY.md §03). A failure keeps the device
  // cookie, so the tablet still only takes PINs.
  const auth = await getAuth("admin");
  const requestHeaders = await headers();
  if (await auth.api.getSession({ headers: requestHeaders }))
    await auth.api.signOut({ headers: requestHeaders });
  if (await auth.api.getSession({ headers: requestHeaders }))
    throw new Error("The member session on a signed-out tablet did not end");
  const { domain } = staffDeviceCookieOptions(new Date(0));
  for (const name of [deviceCookieName, staffCookieName])
    jar.delete({ name, path: "/", domain });
  jar.delete({ name: DEVICE_BAR_COOKIE, path: "/" });
  redirect("/sign-in");
}
