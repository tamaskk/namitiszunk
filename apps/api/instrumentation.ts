import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Every committed order transition in this process emits order/status.changed (T-035).
    const { onStatusChanged, setDefaultErrorReporter } =
      await import("@namitiszunk/core/orders");
    const { publishStatusChanged } = await import("./src/inngest/client");
    onStatusChanged(publishStatusChanged);
    // A failed post-commit hook (Ably publish, Inngest emit) never fails the transition: it goes to Sentry.
    setDefaultErrorReporter((error) => Sentry.captureException(error));
  }
}

// Reports errors thrown while rendering or in route handlers, with the request path.
export const onRequestError = Sentry.captureRequestError;
