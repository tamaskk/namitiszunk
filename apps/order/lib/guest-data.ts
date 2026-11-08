import "server-only";

import { guestActorFromToken } from "@namitiszunk/auth";
import { connectDb } from "@namitiszunk/core/api";
import { NotFoundError } from "@namitiszunk/core/errors";

type GuestActor = Awaited<ReturnType<typeof guestActorFromToken>>;

/**
 * Loads guest data for one order behind its token (T-043, T-044). No order, no token and a wrong
 * token all give null, so the page answers the same 404 for each (T-030).
 */
export async function loadForGuest<T>(
  orderId: string,
  token: string | string[] | undefined,
  load: (actor: GuestActor) => Promise<T>,
): Promise<T | null> {
  if (typeof token !== "string") return null;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");
  await connectDb(uri);
  try {
    return await load(await guestActorFromToken(orderId, token));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
