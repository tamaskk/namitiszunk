import { adminSessionCookie } from "./db";

// `next dev` compiles a route (and its server actions) on the first request. On a CI runner that
// first compile can outlast a test's timeouts, so every route the specs open is requested once,
// one at a time, before the first test. A spec that opens a new route adds it here.
const routes = [
  "/sign-in",
  "/",
  "/menu",
  "/menu/import",
  "/settings",
  "/dev/ui",
];

export default async function warmUp() {
  const cookie = `nmi-admin.session_token=${adminSessionCookie("owner")}`;
  for (const route of routes) {
    await fetch(`http://localhost:3102${route}`, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
  }
}
