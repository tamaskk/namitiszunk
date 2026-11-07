import "server-only";

import { randomUUID } from "node:crypto";

import { blobUrlSchema } from "@namitiszunk/validators";
import { del } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

import { type Actor, requirePermission } from "../auth/permissions";
import { AppError } from "../errors";

export const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * Product images belong to the menu (Manager or Owner). Logo and cover change the venue's
 * public face, so they follow venue settings (Owner, or HQ admin with a confirmed write).
 */
export const uploadPermission = {
  product: "menu.edit",
  venue: "venue.editSettings",
} as const;

export type UploadKind = keyof typeof uploadPermission;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The token constraints. The pathname is always generated here, never taken from the client. */
export function uploadTokenOptions(venueId: string) {
  return {
    pathname: `venues/${venueId}/${randomUUID()}`,
    allowedContentTypes: UPLOAD_CONTENT_TYPES,
    maximumSizeInBytes: UPLOAD_MAX_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + TOKEN_TTL_MS,
  };
}

/** A one-upload client token; the browser sends the file straight to Blob with `put(pathname, file, { token })`. */
export async function createUploadToken(
  actor: Actor,
  input: { venueId: string; kind: UploadKind },
): Promise<{ clientToken: string; pathname: string }> {
  requirePermission(actor, uploadPermission[input.kind], {
    venueId: input.venueId,
  });
  const options = uploadTokenOptions(input.venueId);
  const clientToken = await generateClientTokenFromReadWriteToken(options);
  return { clientToken, pathname: options.pathname };
}

/** True only for an image we issued for this venue: our Blob host and exactly `venues/{venueId}/{uuid}`. */
export function isVenueBlobUrl(url: string, venueId: string): boolean {
  // The venue id goes into the RegExp below, so it must be a plain ObjectId first.
  if (!/^[0-9a-f]{24}$/.test(venueId)) return false;
  if (!blobUrlSchema.safeParse(url).success) return false;
  const { pathname, search, hash } = new URL(url);
  return (
    search === "" &&
    hash === "" &&
    new RegExp(`^/venues/${venueId}/${UUID}$`).test(pathname)
  );
}

/** Deletes a replaced or removed image. Refuses any URL outside the actor's venue folder. */
export async function deleteBlob(
  actor: Actor,
  input: { venueId: string; kind: UploadKind; url: string },
): Promise<void> {
  requirePermission(actor, uploadPermission[input.kind], {
    venueId: input.venueId,
  });
  if (!isVenueBlobUrl(input.url, input.venueId))
    throw new AppError(400, "validation_failed", { url: "invalid" });
  await del(input.url);
}
