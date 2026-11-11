import { setBarPaused } from "@namitiszunk/core/bar-view";
import { barPauseInputSchema } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";

// The bar's own 5 / 10 / 15 minute pause (T-054); 0 resumes it.
export const POST = handler(
  {
    auth: getSessionActor,
    // setBarPaused checks bar.pauseOrders on the bar's venue.
    permission: "none",
    input: barPauseInputSchema,
    rateLimit: { limit: 30, windowSeconds: 60 },
  },
  ({ actor, input, params }) =>
    setBarPaused(actor, String(params.id), input.minutes),
);
