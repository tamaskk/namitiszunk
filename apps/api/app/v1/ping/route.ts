import { handler } from "@/lib/handler";

// Smallest /v1 endpoint: proves the wrapper, rate limit and CORS end to end (T-029).
export const GET = handler(
  { rateLimit: { limit: 60, windowSeconds: 60 } },
  async () => ({ pong: true }),
);
