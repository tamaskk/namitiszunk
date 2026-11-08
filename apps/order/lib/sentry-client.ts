import { sentryOptions } from "@namitiszunk/config/sentry";

type Sentry = typeof import("@sentry/nextjs");

let loading: Promise<Sentry> | undefined;

/**
 * The browser Sentry SDK, initialised once. It is a dynamic import so it stays out of the guest
 * menu's initial JS (T-040, under 150 KB gzip); instrumentation-client loads it when idle, and
 * error boundaries load it on demand.
 */
export function loadSentry(): Promise<Sentry> {
  loading ??= import("@sentry/nextjs").then((Sentry) => {
    Sentry.init(
      sentryOptions("order", {
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
      }),
    );
    return Sentry;
  });
  return loading;
}

/** Reports an error, loading the SDK first if needed; a failed load must not throw on top. */
export function reportClientError(error: unknown): void {
  loadSentry()
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {
      // The SDK chunk could not load (offline): nothing left to report to.
    });
}
