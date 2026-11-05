import { bearerTokenMatches } from "@/lib/bearer-token";

// Throws on purpose so the Sentry setup can be proven in production (T-017).
// TODO(T-030): require the HQ Admin role instead of the shared token.
// TODO(T-029): put it behind the shared rate limiter; until then the 32-character token is the guard.

// 404, not 401 or 405: the endpoint does not admit it exists.
const notFound = () => new Response(null, { status: 404 });

export async function POST(request: Request) {
  if (
    !bearerTokenMatches(
      request.headers.get("authorization"),
      process.env.SENTRY_TEST_TOKEN,
    )
  ) {
    return notFound();
  }
  throw new Error("Sentry test error (T-017): this is expected.");
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
