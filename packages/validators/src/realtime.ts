import { z } from "zod";

import { objectIdSchema } from "./shared";

/** POST /v1/realtime/token: a signed-in user names the venue; staff tablets and guests send `{}`. */
export const realtimeTokenInputSchema = z.object({
  venueId: objectIdSchema.optional(),
});
export type RealtimeTokenInput = z.infer<typeof realtimeTokenInputSchema>;

/** An Ably TokenRequest, signed by the server; the Ably client exchanges it for a token. */
export const realtimeTokenResponseSchema = z.looseObject({
  keyName: z.string(),
  capability: z.string(),
  timestamp: z.number().int(),
  nonce: z.string(),
  mac: z.string(),
  ttl: z.number().int().optional(),
  clientId: z.string().optional(),
});
