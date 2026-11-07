// Workspace packages export TypeScript source, so every Next app must transpile them.
export const transpilePackages = [
  "@namitiszunk/api-client",
  "@namitiszunk/config",
  "@namitiszunk/core",
  "@namitiszunk/db",
  "@namitiszunk/emails",
  "@namitiszunk/i18n",
  "@namitiszunk/ui",
  "@namitiszunk/validators",
];

/**
 * withSentryConfig options shared by every app. Source maps are uploaded and the release
 * (the git SHA) created only for production builds; other builds skip both quietly.
 * @param {Record<string, string | undefined>} env usually process.env
 */
export function sentryBuildOptions(env) {
  return {
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    authToken: env.SENTRY_AUTH_TOKEN,
    release: { name: env.VERCEL_GIT_COMMIT_SHA },
    // Explicit: the SDK default is skipped when an app sets productionBrowserSourceMaps.
    sourcemaps: {
      disable: env.VERCEL_ENV !== "production",
      deleteSourcemapsAfterUpload: true,
    },
    silent: !env.CI,
    telemetry: false,
  };
}

/**
 * next/image for uploaded images (T-038): only the Vercel Blob public host (validators' blobUrlSchema)
 * under venues/, served as AVIF first, WebP as fallback.
 */
export const images = {
  formats: /** @type {("image/avif" | "image/webp")[]} */ ([
    "image/avif",
    "image/webp",
  ]),
  remotePatterns: [
    {
      protocol: /** @type {const} */ ("https"),
      hostname: "*.public.blob.vercel-storage.com",
      pathname: "/venues/**",
    },
  ],
};
