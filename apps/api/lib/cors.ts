type WebApp = "landing" | "order" | "admin" | "hq" | "api";

const PRODUCTION_ORIGINS: Record<string, WebApp> = {
  "https://namitiszunk.hu": "landing",
  "https://rendel.namitiszunk.hu": "order",
  "https://admin.namitiszunk.hu": "admin",
  "https://hq.namitiszunk.hu": "hq",
  // Same-origin POSTs (the API's own pages) carry an Origin too.
  "https://api.namitiszunk.hu": "api",
};

// landing, order, admin, hq and the API itself on their dev ports.
const DEVELOPMENT_ORIGINS: Record<string, WebApp> = {
  "http://localhost:3000": "landing",
  "http://localhost:3001": "order",
  "http://localhost:3002": "admin",
  "http://localhost:3003": "hq",
  "http://localhost:3004": "api",
};

// Preview deployments of our Vercel projects: namitiszunk-<app>-<branch or hash>-<team>.vercel.app.
// shortcut: another team's project named namitiszunk-<app>... would match too; pin the team slug once the Vercel team is final (T-014).
const PREVIEW_ORIGIN =
  /^https:\/\/namitiszunk-(landing|order|admin|hq|api)-[a-z0-9-]+\.vercel\.app$/;

/** Which of our web apps an allowlisted origin belongs to, or null for any other origin. */
export function originApp(
  origin: string,
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): WebApp | null {
  if (Object.hasOwn(PRODUCTION_ORIGINS, origin))
    return PRODUCTION_ORIGINS[origin]!;
  if (nodeEnv === "development" && Object.hasOwn(DEVELOPMENT_ORIGINS, origin))
    return DEVELOPMENT_ORIGINS[origin]!;
  const preview = vercelEnv === "preview" && PREVIEW_ORIGIN.exec(origin);
  return preview ? (preview[1] as WebApp) : null;
}

/** Only our own web apps may call the API from a browser; the mobile app sends no Origin. */
export function isAllowedOrigin(
  origin: string,
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): boolean {
  return originApp(origin, nodeEnv, vercelEnv) !== null;
}

/** Only for allowlisted origins (proxy.ts): credentials let the web apps send their session cookie. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key, X-Session-Id, X-Guest-Token",
    "Access-Control-Expose-Headers": "Retry-After, x-request-id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
