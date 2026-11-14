import { validateBuildEnv } from "@namitiszunk/config/env";
import {
  sentryBuildOptions,
  transpilePackages,
} from "@namitiszunk/config/next";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

const nextConfig: NextConfig = {
  transpilePackages,
  cacheComponents: true,
  partialPrefetching: true,
  // forbidden() for a signed-in user without the platform role (T-066).
  experimental: { authInterrupts: true },
  // The CSP is per request (proxy.ts); these are the same on every HQ response (T-066).
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=()",
        },
      ],
    },
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin();

// Fail fast with the missing variable names when serving or building, not on lint or typegen.
// `next typegen` loads this file with the build phase, so it is told apart by its argv.
export default function config(phase: string): NextConfig {
  const generatingTypes = process.argv.includes("typegen");
  if (
    !generatingTypes &&
    (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD)
  ) {
    validateBuildEnv("hq", process.env);
  }
  return withSentryConfig(
    withNextIntl(nextConfig),
    sentryBuildOptions(process.env),
  );
}
