import "server-only";

import { guestActorFromToken } from "@namitiszunk/auth";
import { connectDb } from "@namitiszunk/core/api";
import { NotFoundError } from "@namitiszunk/core/errors";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { guestTokenCookie } from "./guest-link";

type GuestActor = Awaited<ReturnType<typeof guestActorFromToken>>;

/**
 * Loads guest data for one order behind its token (T-043, T-044). The proxy moved the token from the
 * link into the order's cookie. No order, no token and a wrong token all give null, so the page
 * answers the same 404 for each (T-030).
 */
export async function loadForGuest<T>(
  orderId: string,
  load: (actor: GuestActor) => Promise<T>,
): Promise<{ data: T; token: string } | null> {
  // Request time only: the order changes from one request to the next, never prerender it.
  await connection();
  const token = (await cookies()).get(guestTokenCookie(orderId))?.value;
  if (!token) return null;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");
  await connectDb(uri);
  try {
    return {
      data: await load(await guestActorFromToken(orderId, token)),
      token,
    };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
