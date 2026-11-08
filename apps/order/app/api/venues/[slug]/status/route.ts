import { clientIp, hitRateLimit } from "@namitiszunk/core/api";
import { getVenueStatus } from "@namitiszunk/core/menu";
import {
  fieldErrorKeys,
  venueSlugSchema,
  venueStatusQuerySchema,
  type VenueStatusResponse,
} from "@namitiszunk/validators";

import { ensureDb } from "@/lib/db";

// A backstop only: the CDN answers most polls. Guests on the club Wi-Fi share one address,
// so 300 a minute per address and venue leaves room for about 150 open menus.
const RATE_LIMIT = { limit: 300, windowSeconds: 60 };

function fail(
  status: number,
  code: string,
  {
    fields = {},
    headers = {},
  }: { fields?: Record<string, string>; headers?: HeadersInit } = {},
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
  const ip = clientIp(request);
  if (ip === null) return fail(400, "client_unknown");

  await ensureDb();
  const limited = await hitRateLimit(
    `GET /api/venues/status|ip:${ip}|venue:${slug}`,
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
  // The same for every guest of a bar, so the CDN may share it; shorter than the 30 s poll.
  return Response.json(
    { data },
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    },
  );
}
