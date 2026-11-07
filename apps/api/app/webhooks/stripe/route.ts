import { connectDb } from "@namitiszunk/core/api";
import { AppError } from "@namitiszunk/core/errors";
import { processConnectWebhook } from "@namitiszunk/core/payments";
import * as Sentry from "@sentry/nextjs";

import { errorResponse } from "@/lib/error-response";

// The Stripe Connect webhook (T-032). Outside /v1 and handler() on purpose: Stripe is not an API
// client, it authenticates with the signature on the raw body (no session, no CORS, no JSON
// parsing before the check), and its own retries replace our rate limit and idempotency keys.
export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    await connectDb(uri);
    await processConnectWebhook(
      await request.text(),
      request.headers.get("stripe-signature"),
    );
    return Response.json({ data: { received: true } });
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(error.status, error.code, requestId);
    }
    // A 500 makes Stripe retry; the stored event id keeps the retry from running twice.
    Sentry.captureException(error, { tags: { requestId } });
    return errorResponse(500, "internal", requestId);
  }
}
