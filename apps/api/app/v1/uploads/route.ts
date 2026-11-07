import { requirePermission } from "@namitiszunk/core/auth";
import { createUploadToken, uploadPermission } from "@namitiszunk/core/uploads";
import { uploadTokenInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// A client token for one image; the browser then uploads straight to Blob, so the file never passes this function.
export const POST = handler(
  {
    auth: getSessionActor,
    permission: ({ actor, input }) =>
      requirePermission(actor, uploadPermission[input.kind], {
        venueId: input.venueId,
      }),
    input: uploadTokenInputSchema,
    rateLimit: { limit: 30, windowSeconds: 60 },
  },
  ({ actor, input }) => createUploadToken(actor, input),
);
