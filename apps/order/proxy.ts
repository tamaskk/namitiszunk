import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next and Vercel internals, and files such as favicon.ico.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
