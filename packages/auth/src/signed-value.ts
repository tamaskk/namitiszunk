import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET is missing or shorter than 32");
  return secret;
}

// The purpose is part of the MAC, so a device cookie can never be replayed as a staff cookie.
function mac(purpose: string, body: string): Buffer {
  return createHmac("sha256", authSecret())
    .update(`${purpose}|${body}`)
    .digest();
}

/** `base64url(json).base64url(hmac)`; `exp` is an absolute time in ms. */
export function signValue(
  purpose: string,
  payload: Record<string, string>,
  expiresAt: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: expiresAt }),
  ).toString("base64url");
  return `${body}.${mac(purpose, body).toString("base64url")}`;
}

/** The payload when the signature matches and it has not expired; otherwise null. */
export function verifySignedValue(
  purpose: string,
  value: string | undefined,
  now = Date.now(),
): Record<string, string> | null {
  if (!value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const given = Buffer.from(signature, "base64url");
  const expected = mac(purpose, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;

  const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString());
  if (typeof parsed !== "object" || parsed === null) return null;
  const { exp, ...payload } = parsed as Record<string, unknown>;
  if (typeof exp !== "number" || exp <= now) return null;
  if (!Object.values(payload).every((v) => typeof v === "string")) return null;
  return payload as Record<string, string>;
}

/** Reads one cookie from a request's Cookie header. */
export function readCookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return undefined; // a malformed cookie is the same as none
    }
  }
  return undefined;
}
