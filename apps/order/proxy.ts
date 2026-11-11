import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "./i18n/routing";
import { guestTokenCookie, readGuestLink } from "./lib/guest-link";

const intl = createMiddleware(routing);

// 30 days: long enough to reopen the confirmation from the e-mail or history later.
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export default function proxy(request: NextRequest) {
  const link = readGuestLink(request.nextUrl);
  if (!link) return intl(request);

  // The token moves from the URL into an httpOnly cookie, so the address bar, history and print never show it.
  const response = NextResponse.redirect(link.clean);
  response.headers.set("Referrer-Policy", "no-referrer");
  if (link.token)
    response.cookies.set(guestTokenCookie(link.orderId), link.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  return response;
}

export const config = {
  // Skip API routes, printed QR redirects (/q), Next and Vercel internals, and files such as favicon.ico.
  matcher: "/((?!(?:api|_next|_vercel|q)(?:/|$)|.*\\..*).*)",
};
