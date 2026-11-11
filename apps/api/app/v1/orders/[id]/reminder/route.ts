import { sendReminderFromBar } from "@namitiszunk/core/bar-view";

import { handler } from "@/lib/handler";
import { getSessionActor } from "@/lib/session-actor";
import { deps } from "@/src/inngest/deps";

// The Ready card's reminder button (T-054): sends now, once per order (the 10-minute timer then skips).
export const POST = handler(
  {
    auth: getSessionActor,
    // sendReminderFromBar checks order.sendReminder on the order's venue.
    permission: "none",
    rateLimit: { limit: 60, windowSeconds: 60 },
  },
  async ({ actor, params }) => ({
    channel: await sendReminderFromBar(actor, String(params.id), deps.notify),
  }),
);
