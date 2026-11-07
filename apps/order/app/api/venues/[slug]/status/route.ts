import { hitRateLimit } from "@namitiszunk/core/api";
import { getVenueStatus } from "@namitiszunk/core/menu";
import {
  fieldErrorKeys,
  venueSlugSchema,
  venueStatusQuerySchema,
  type VenueStatusResponse,
} from "@namitiszunk/validators";

import { ensureDb } from "@/lib/db";

// Guests on the club Wi-Fi share one address: 30 s polling leaves room for about 150 open menus.
const RATE_LIMIT = { limit: 300, windowSeconds: 60 };

function fail(
  status: number,
  code: string,
  {
    fields = {},
    headers = {},
  }: { fields?: object; headers?: HeadersInit } = {},
) {
  return Response.json(
    { error: { code, messageKey: `apiErrors.${code}`, fields } },
    { status, headers },
  );
}

/** The live part of the guest menu (T-040): open / paused / closed, wait, sold-out ids. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/venues/[slug]/status">,
) {
  const { slug } = await params;
  if (!venueSlugSchema.safeParse(slug).success) {
    return fail(400, "validation_failed", {
      fields: { slug: "validation.slug.invalid" },
    });
  }
  const query = venueStatusQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return fail(400, "validation_failed", {
      fields: fieldErrorKeys(query.error),
    });
  }

  await ensureDb();
  // Vercel overwrites x-forwarded-for with the real client address, so it cannot be spoofed there.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const limited = await hitRateLimit(
    `GET /api/venues/status|ip:${ip || "local"}`,
    RATE_LIMIT,
  );
  if (limited) {
    return fail(429, "rate_limited", {
      headers: { "Retry-After": String(limited.retryAfterSeconds) },
    });
  }

  const status = await getVenueStatus({ slug, barId: query.data.bar });
  if (!status) return fail(404, "not_found");

  const data: VenueStatusResponse = {
    ...status,
    pausedUntil: status.pausedUntil?.toISOString() ?? null,
  };
  // Shorter than the 30 s poll, so a sold-out switch reaches the next poll.
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, max-age=10" } },
  );
}
