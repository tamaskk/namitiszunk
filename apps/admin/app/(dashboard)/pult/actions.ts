"use server";

import {
  createDeviceSession,
  deviceCookieName,
  getAuth,
  isStaffDevice,
  staffDeviceCookieOptions,
  userActorFromHeaders,
} from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import { registerDeviceInputSchema } from "@namitiszunk/validators";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { DEVICE_BAR_COOKIE } from "@/lib/staff-device";

export type DeviceActionResult = { error: { code: string } };

/**
 * A Manager or Owner turns this browser into the venue's bar tablet (T-054), or with no bar into
 * the VIP host's phone (T-055). From then on only a
 * PIN holder acts here (SECURITY.md §03); the member session left on it counts for nothing.
 */
export async function registerDeviceAction(
  input: unknown,
): Promise<DeviceActionResult> {
  const parsed = registerDeviceInputSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "validation_failed" } };
  const { venue } = await getAdminContext();
  if (!venue) return { error: { code: "forbidden" } };
  const requestHeaders = await headers();
  // A registered tablet cannot register itself again: that would let a PIN holder renew it forever.
  if (
    isStaffDevice(
      new Request("https://admin.local/", { headers: requestHeaders }),
    )
  )
    return { error: { code: "forbidden" } };
  const auth = await getAuth("admin");
  const user = await userActorFromHeaders(auth, "admin", requestHeaders);
  if (!user) return { error: { code: "forbidden" } };

  let device: Awaited<ReturnType<typeof createDeviceSession>>;
  try {
    device = await createDeviceSession(user, venue.id, parsed.data.barId);
  } catch (error) {
    if (error instanceof AppError) return { error: { code: error.code } };
    throw error;
  }
  const jar = await cookies();
  jar.set(
    deviceCookieName,
    device.cookieValue,
    staffDeviceCookieOptions(device.expiresAt),
  );
  if (parsed.data.barId)
    jar.set(DEVICE_BAR_COOKIE, parsed.data.barId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: device.expiresAt,
    });
  else jar.delete(DEVICE_BAR_COOKIE);
  redirect("/pin");
}
