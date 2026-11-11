"use server";

import {
  deviceCookieName,
  signInStaffWithPin,
  staffCookieName,
  staffDeviceCookieOptions,
} from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import { devicePinSignInInputSchema } from "@namitiszunk/validators";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ensureDb } from "@/lib/db";

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
