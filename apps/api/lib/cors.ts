const PRODUCTION_ORIGINS = [
  "https://namitiszunk.hu",
  "https://rendel.namitiszunk.hu",
  "https://admin.namitiszunk.hu",
  "https://hq.namitiszunk.hu",
  // Same-origin POSTs (the API's own pages) carry an Origin too.
  "https://api.namitiszunk.hu",
];

// landing, order, admin, hq and the API itself on their dev ports.
const DEVELOPMENT_ORIGINS = [3000, 3001, 3002, 3003, 3004].map(
  (port) => `http://localhost:${port}`,
);

// Preview deployments of our Vercel projects: namitiszunk-<app>-<branch or hash>-<team>.vercel.app.
// shortcut: another team's project named namitiszunk-<app>... would match too; pin the team slug once the Vercel team is final (T-014).
const PREVIEW_ORIGIN =
  /^https:\/\/namitiszunk-(landing|order|admin|hq|api)-[a-z0-9-]+\.vercel\.app$/;

/** Only our own web apps may call the API from a browser; the mobile app sends no Origin. */
export function isAllowedOrigin(
  origin: string,
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): boolean {
  return (
    PRODUCTION_ORIGINS.includes(origin) ||
    (nodeEnv === "development" && DEVELOPMENT_ORIGINS.includes(origin)) ||
    (vercelEnv === "preview" && PREVIEW_ORIGIN.test(origin))
  );
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key, X-Session-Id",
    "Access-Control-Expose-Headers": "Retry-After, x-request-id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
