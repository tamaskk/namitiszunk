import { createTokenRequest } from "@namitiszunk/core/realtime";
import { realtimeTokenInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { realtimeCaller } from "@/lib/realtime-caller";

// The Ably client's authUrl (T-043, T-054): a subscribe-only TokenRequest for the caller's channels.
export const POST = handler(
  {
    auth: realtimeCaller,
    // createTokenRequest checks RBAC per channel (T-023) and answers 403 when the caller may see none.
    permission: "none",
    input: realtimeTokenInputSchema,
    rateLimit: { limit: 30, windowSeconds: 60 },
  },
  async ({ actor, input }) => createTokenRequest(actor, input),
);
