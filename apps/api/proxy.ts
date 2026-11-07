import { NextResponse, type NextRequest } from "next/server";

import { corsHeaders, isAllowedOrigin } from "@/lib/cors";
import { errorResponse } from "@/lib/error-response";

// CORS for every /v1 route, preflight included, before any route handler runs (T-029).
export function proxy(request: NextRequest): Response {
  const origin = request.headers.get("origin");
  // Server-to-server calls and the mobile app send no Origin; CORS does not apply.
  if (!origin) return NextResponse.next();
  // A foreign origin gets no CORS headers, so the browser blocks the response.
  if (!isAllowedOrigin(origin)) {
    return errorResponse(403, "origin_forbidden", crypto.randomUUID());
  }
  const headers = corsHeaders(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = { matcher: "/v1/:path*" };
