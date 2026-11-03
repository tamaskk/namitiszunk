import { validateBuildEnv } from "@namitiszunk/config/env";
import { transpilePackages } from "@namitiszunk/config/next";
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
    validateBuildEnv("admin", process.env);
  }
  return withNextIntl(nextConfig);
}
