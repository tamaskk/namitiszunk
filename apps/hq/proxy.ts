import { hqModules, requireHqModule } from "@namitiszunk/core/hq";
import { isLocale } from "@namitiszunk/i18n";
import { NextResponse, type NextRequest } from "next/server";

import { loadHqContext } from "@/lib/hq-context";

/**
 * Every HQ response gets a per-request nonce CSP (T-066): Next adds the nonce to its own scripts,
 * nothing else runs, and no site may frame the page. A module path is also checked before
 * rendering: a club Owner, or a role the module is not for, gets a real 403 status, not a 200 shell.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = (await refused(request))
    ? await forbiddenResponse(request)
    : NextResponse.next({ request: { headers: requestHeaders } });
  // The fetched 403 page carries its own nonce, so it keeps its own policy.
  if (!response.headers.has("content-security-policy"))
    response.headers.set("content-security-policy", csp);
  return response;
}

// Pages anyone may load: the sign-in steps and the 403 page itself.
const openPaths = ["/sign-in", "/forbidden"];

async function refused(request: NextRequest): Promise<boolean> {
  const path = request.nextUrl.pathname;
  // A client-side navigation gets the page's own forbidden() UI; the status matters for a full load.
  if (openPaths.includes(path) || request.headers.has("rsc")) return false;
  // A failed lookup (database down) is left to the layout, which shows error.tsx; pages still check.
  const context = await loadHqContext(request.headers).catch(() => null);
  if (context === null) return false;
  if (context === "forbidden") return true;
  // No session or no 2FA yet: the layout sends to the sign-in step.
  if (typeof context === "string") return false;
  const target = hqModules.find(
    (m) => path === m.path || path.startsWith(`${m.path}/`),
  );
  if (!target) return false;
  try {
    requireHqModule(context, target.key);
    return false;
  } catch {
    return true;
  }
}

/**
 * The 403 page with a 403 status, fetched from the app's configured URL (never the Host header),
 * with only the locale cookie: the page needs no session. Any failure still answers a plain 403.
 * shortcut: one extra internal request per refused full page load; fine while refusals are rare.
 */
async function forbiddenResponse(request: NextRequest): Promise<NextResponse> {
  const plain = new NextResponse("Forbidden", {
    status: 403,
    headers: { "cache-control": "private, no-store" },
  });
  const origin = process.env.BETTER_AUTH_URL;
  if (!origin) return plain;
  const stored = request.cookies.get("NEXT_LOCALE")?.value;
  try {
    const page = await fetch(new URL("/forbidden", origin), {
      headers: isLocale(stored) ? { cookie: `NEXT_LOCALE=${stored}` } : {},
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!page.ok) return plain;
    return new NextResponse(page.body, {
      status: 403,
      headers: {
        "content-type": page.headers.get("content-type") ?? "text/html",
        "cache-control": "private, no-store",
        "content-security-policy":
          page.headers.get("content-security-policy") ?? "default-src 'none'",
      },
    });
  } catch {
    return plain;
  }
}

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React's dev tools need eval in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Next and Tailwind set inline styles; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    // The TOTP QR code is a data URL.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Everything but Next's static files: the auth endpoints answer JSON and need no nonce.
export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
