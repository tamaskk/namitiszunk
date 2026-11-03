import { transpilePackages } from "@namitiszunk/config/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
