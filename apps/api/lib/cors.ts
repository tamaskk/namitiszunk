const PRODUCTION_ORIGINS = [
  "https://namitiszunk.hu",
  "https://rendel.namitiszunk.hu",
  "https://admin.namitiszunk.hu",
  "https://hq.namitiszunk.hu",
];

// landing, order, admin and hq on their dev ports.
const DEVELOPMENT_ORIGINS = [3000, 3001, 3002, 3003].map(
  (port) => `http://localhost:${port}`,
);

/** Only our own web apps may call the API from a browser; the mobile app sends no Origin. */
export function isAllowedOrigin(
  origin: string,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return (
    PRODUCTION_ORIGINS.includes(origin) ||
    (nodeEnv === "development" && DEVELOPMENT_ORIGINS.includes(origin))
  );
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Expose-Headers": "Retry-After, x-request-id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
