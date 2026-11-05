import { sentryOptions } from "@namitiszunk/config/sentry";
import * as Sentry from "@sentry/nextjs";

Sentry.init(
  sentryOptions("order", {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
