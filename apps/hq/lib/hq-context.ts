import "server-only";

import { getAuth, userActorFromHeaders } from "@namitiszunk/auth";
import { AppError } from "@namitiszunk/core/errors";
import {
  type HqModuleKey,
  isPlatformActor,
  type PlatformActor,
  requireHqModule,
} from "@namitiszunk/core/hq";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { ensureDb } from "./db";

/** Where the sign-in page sends a session that may not use HQ yet (T-066). */
export type HqSignInStep = "signIn" | "setup" | "totp";

/**
 * The HQ user behind the request, or why there is none: no session, 2FA not set up yet, no TOTP
 * check in this session, or a signed-in user without an active platform role (a club Owner).
 */
export async function loadHqContext(
  requestHeaders: Headers,
): Promise<PlatformActor | HqSignInStep | "forbidden"> {
  await ensureDb();
  try {
    const actor = await userActorFromHeaders(
      await getAuth("hq"),
      "hq",
      requestHeaders,
    );
    if (!actor) return "signIn";
    return isPlatformActor(actor) ? actor : "forbidden";
  } catch (error) {
    if (error instanceof AppError && error.code === "two_factor_setup_required")
      return "setup";
    if (error instanceof AppError && error.code === "two_factor_required")
      return "totp";
    if (error instanceof AppError && error.code === "platform_role_required")
      return "forbidden";
    throw error;
  }
}

/** The signed-in platform member for pages, layouts and actions, once per request. */
export const getHqActor = cache(async (): Promise<PlatformActor> => {
  // The session expiry check reads the clock: request time only, never a prerender.
  await connection();
  const context = await loadHqContext(await headers());
  // The sign-in page reads the session itself and shows the step it still needs.
  if (context === "signIn" || context === "setup" || context === "totp")
    redirect("/sign-in");
  if (context === "forbidden") forbidden();
  return context;
});

/** The check at the top of every HQ module page and server action (T-066): 403 without the permission. */
export async function requireHqPage(key: HqModuleKey): Promise<PlatformActor> {
  const actor = await getHqActor();
  try {
    requireHqModule(actor, key);
  } catch {
    forbidden();
  }
  return actor;
}
