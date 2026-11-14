import { createPlatformAdmin, hqSessionCookie } from "./db";

// `next dev` compiles a route on its first request. On a CI runner that first compile can outlast
// a test's timeouts, so every route the specs open is requested once before the first test.
const routes = [
  "/sign-in",
  "/",
  "/venues",
  "/orders",
  "/leads",
  "/finance",
  "/audit",
  "/forbidden",
  "/robots.txt",
];

export default async function warmUp() {
  const admin = createPlatformAdmin({ twoFactorEnabled: true });
  const cookie = `nmi-hq.session_token=${hqSessionCookie(admin, { verified: true })}`;
  for (const route of routes) {
    await fetch(`http://localhost:3103${route}`, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
  }
}
