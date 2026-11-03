import { sentryOptions } from "@namitiszunk/config/sentry";
import * as Sentry from "@sentry/nextjs";

Sentry.init(
  sentryOptions("landing", {
    dsn: process.env.SENTRY_DSN,
    vercelEnv: process.env.VERCEL_ENV,
  }),
);
