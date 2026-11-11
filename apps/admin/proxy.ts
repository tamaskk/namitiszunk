import { adminModules } from "@namitiszunk/core/admin";
import { isLocale } from "@namitiszunk/i18n";
import { NextResponse, type NextRequest } from "next/server";

import {
  contextCanOpen,
  loadAdminContext,
  VENUE_COOKIE,
} from "@/lib/admin-context";

// Read by i18n/request.ts; the staff apps keep the locale in this cookie.
const LOCALE_COOKIE = "NEXT_LOCALE";

// In production a page streams its shell before forbidden() runs, so the HTTP status would stay 200.
// The role check runs here first, before rendering, and answers a forbidden module with a real 403.
export async function proxy(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname;
  const target = adminModules.find(
    (m) => m.path !== "/" && (path === m.path || path.startsWith(`${m.path}/`)),
  );
  if (!target) return NextResponse.next();

  // A client-side navigation (RSC request) gets the page's own forbidden() UI in its payload,
  // so it skips the lookup here; the 403 status matters for a full page load.
  if (request.headers.has("rsc")) return NextResponse.next();

  const context = await loadAdminContext(
    request.headers,
    request.cookies.get(VENUE_COOKIE)?.value,
  );
  // A bar tablet without an active PIN holder goes to the PIN screen (T-054), outside the module paths.
  if (context === "pinRequired")
    return NextResponse.redirect(new URL("/pin", request.nextUrl));
  // No session, or no venue yet: the layout sends to sign-in or shows the no-venue screen.
  if (
    typeof context === "string" ||
    context.venue === null ||
    contextCanOpen(context, target.key)
  )
    return NextResponse.next();
  return forbiddenResponse(request);
}

/**
 * A rewrite keeps the page's 200, so the forbidden page is fetched and sent with 403 instead.
 * The origin is the app's configured URL, never the request's Host header, and only the locale
 * cookie goes along: the page needs no session. Any failure still answers a plain 403.
 * shortcut: one extra internal request per refused full page load; fine while refusals are rare.
 */
async function forbiddenResponse(request: NextRequest): Promise<Response> {
  const plain = new Response("Forbidden", {
    status: 403,
    headers: { "cache-control": "private, no-store" },
  });
  const origin = process.env.BETTER_AUTH_URL;
  if (!origin) return plain;
  const stored = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : null;
  try {
    const page = await fetch(new URL("/forbidden", origin), {
      headers: locale ? { cookie: `${LOCALE_COOKIE}=${locale}` } : {},
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!page.ok) return plain;
    return new Response(page.body, {
      status: 403,
      headers: {
        "content-type": page.headers.get("content-type") ?? "text/html",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return plain;
  }
}

// Module paths only: sign-in, auth, static files and the dashboard never pay for a session lookup.
export const config = {
  matcher: [
    "/pult/:path*",
    "/orders/:path*",
    "/menu/:path*",
    "/bars/:path*",
    "/staff/:path*",
    "/reports/:path*",
    "/promos/:path*",
    "/payouts/:path*",
    "/reviews/:path*",
    "/settings/:path*",
    "/billing/:path*",
  ],
};
