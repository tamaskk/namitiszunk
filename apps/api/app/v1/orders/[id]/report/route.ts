import { reportProblem } from "@namitiszunk/core/orders";
import { reportProblemInputSchema } from "@namitiszunk/validators";
import * as Sentry from "@sentry/nextjs";

import { guestCaller } from "@/lib/guest-caller";
import { handler } from "@/lib/handler";
import { inngest, problemReportedEvent } from "@/src/inngest/client";

// A guest reports a problem with a paid order (T-046); web and app both call this. Core caps it at 3
// per order (429 after); the mails go out through Inngest so a Resend outage is retried.
export const POST = handler(
  {
    auth: guestCaller,
    // guestCaller proved the token; core checks the order is the guest's and paid.
    permission: "none",
    input: reportProblemInputSchema,
    rateLimit: { limit: 5, windowSeconds: 60 },
    ipRateLimit: { limit: 600, windowSeconds: 60 },
  },
  async ({ actor, input, params }) => {
    const orderId = String(params.id);
    const { index } = await reportProblem(actor, orderId, input);
    try {
      await inngest.send(problemReportedEvent(orderId, index));
    } catch (error) {
      // The report is stored (the admin order page shows it); a lost mail is found through Sentry.
      Sentry.captureException(error, {
        tags: { inngest_event: "order/problem.reported" },
        extra: { orderId, index },
      });
    }
    return { reported: true as const };
  },
);
