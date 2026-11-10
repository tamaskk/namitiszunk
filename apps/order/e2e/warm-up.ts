// `next dev` compiles a route (and its server actions) on the first request. On a CI runner that
// first compile can outlast a test's timeouts, so every route the specs open is requested once,
// one at a time, before the first test. A spec that opens a new route adds it here.
// A made-up order id still compiles the order pages; they answer 404.
const order = "000000000000000000000000";
const routes = [
  "/hu",
  "/hu/v/demo",
  "/en/v/demo",
  "/hu/v/demo/checkout",
  `/hu/o/${order}`,
  `/hu/o/${order}/thanks`,
  `/hu/r/${order}`,
  "/hu/fiok",
  "/api/venues/demo/status",
];

export default async function warmUp() {
  for (const route of routes) {
    await fetch(`http://localhost:3101${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
  }
}
