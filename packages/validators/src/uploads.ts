import { z } from "zod";

import { objectIdSchema } from "./shared";

/** product: a menu item image (menu.edit); venue: logo or cover image (venue.editSettings). */
export const uploadKindSchema = z.enum(["product", "venue"], {
  error: "validation.uploadKind.invalid",
});

export const uploadTokenInputSchema = z.object({
  venueId: objectIdSchema,
  kind: uploadKindSchema,
});

/** The client uploads with `put(pathname, file, { access: "public", token: clientToken })` from @vercel/blob/client. */
export const uploadTokenResponseSchema = z.object({
  clientToken: z.string(),
  pathname: z.string(),
});
