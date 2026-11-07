import { requirePermission } from "@namitiszunk/core/auth";
import { createAccountLink } from "@namitiszunk/core/payments";
import { stripeConnectInputSchema } from "@namitiszunk/validators";

import { isAllowedOrigin } from "@/lib/cors";
import { handler } from "@/lib/handler";
import { sessionActor } from "@/lib/session-actor";

const ADMIN_ORIGIN = "https://admin.namitiszunk.hu";
const ADMIN_APP = /^(https:\/\/namitiszunk-admin-|http:\/\/localhost:3002$)/;

/** Back to the Admin the Owner came from (local, preview); any other caller gets production. */
function adminBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");
  return origin && ADMIN_APP.test(origin) && isAllowedOrigin(origin)
    ? origin
    : ADMIN_ORIGIN;
}

// An onboarding Account Link that returns to the Admin Payouts page (T-032).
export const POST = handler(
  {
    auth: sessionActor,
    permission: ({ actor, input }) =>
      requirePermission(actor, "payout.manage", { venueId: input.venueId }),
    input: stripeConnectInputSchema,
    rateLimit: { limit: 20, windowSeconds: 60 },
  },
  ({ actor, input, request }) =>
    createAccountLink(input.venueId, actor, adminBaseUrl(request)),
);
