import { connection } from "next/server";

// Polled by Better Stack (T-017). Always fresh, never cached by Vercel or a proxy.
export async function GET() {
  await connection();
  // TODO(T-020): ping MongoDB through @namitiszunk/db and answer 503 when it does not respond.
  const down = process.env.HEALTH_FORCE_FAIL === "1";

  return Response.json(
    { status: down ? "down" : "ok" },
    { status: down ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
