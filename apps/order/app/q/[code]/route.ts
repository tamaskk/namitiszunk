import { clientIp, hitRateLimit } from "@namitiszunk/core/api";
import { resolveQrScan } from "@namitiszunk/core/bars";
import { qrCodeSchema } from "@namitiszunk/validators";

import { ensureDb } from "@/lib/db";

// Guests on the club Wi-Fi share one address; this only stops someone walking the code space.
const RATE_LIMIT = { limit: 300, windowSeconds: 60 };
// One counted scan per code and address a minute: a re-scan or a script cannot inflate the count.
const COUNT_ONCE = { limit: 1, windowSeconds: 60 };

const noStore = { "Cache-Control": "no-store" };

const redirect = (url: URL) =>
  new Response(null, {
    status: 302,
    headers: { ...noStore, Location: url.toString() },
  });

/** A printed QR (T-053): counts the scan and sends the guest to the menu of the zone's current bar. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/q/[code]">,
) {
  const { code } = await params;
  const home = new URL("/", request.url);
  const parsed = qrCodeSchema.safeParse(code);
  if (!parsed.success) return redirect(home);

  await ensureDb();
  // No address (never on Vercel): a guest at a table still gets the menu, only the scan is not counted.
  const ip = clientIp(request);
  let count = false;
  if (ip) {
    const limited = await hitRateLimit(`qr|${ip}`, RATE_LIMIT);
    if (limited)
      return new Response(null, {
        status: 429,
        headers: {
          ...noStore,
          "Retry-After": String(limited.retryAfterSeconds),
        },
      });
    count = !(await hitRateLimit(`qrscan|${ip}|${parsed.data}`, COUNT_ONCE));
  }

  const target = await resolveQrScan(parsed.data, { count });
  if (!target) return redirect(home);

  // No locale in the path: the proxy picks it from the browser, as on a first visit.
  const url = new URL(`/v/${target.slug}`, request.url);
  if (target.barId) url.searchParams.set("bar", target.barId);
  if (target.zoneId) url.searchParams.set("zone", target.zoneId);
  url.searchParams.set("q", target.code);
  return redirect(url);
}
