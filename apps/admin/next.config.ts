import { validateBuildEnv } from "@namitiszunk/config/env";
import { transpilePackages } from "@namitiszunk/config/next";
import type { NextConfig } from "next";
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

// Fail fast with the missing variable names when serving or building, not on lint or typegen.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    validateBuildEnv("admin", process.env);
  }
  return nextConfig;
}
