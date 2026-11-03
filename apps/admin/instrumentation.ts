import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    await import("./sentry.server.config");
  }
}

// Reports errors thrown while rendering or in route handlers, with the request path.
export const onRequestError = Sentry.captureRequestError;
