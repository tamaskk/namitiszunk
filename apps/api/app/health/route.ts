import { pingDb } from "@namitiszunk/core/api";
import { connection } from "next/server";

// Polled by Better Stack (T-017): 503 when MongoDB does not answer, so a database outage alerts.
// Always fresh, never cached by Vercel or a proxy. HEALTH_FORCE_FAIL=1 tests the alert path.
export async function GET() {
  await connection();
  const uri = process.env.MONGODB_URI;
  const down =
    process.env.HEALTH_FORCE_FAIL === "1" || !uri || !(await pingDb(uri));

  return Response.json(
    { status: down ? "down" : "ok" },
    { status: down ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
