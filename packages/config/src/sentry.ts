import type { Options } from "@sentry/core";

import type { AppName } from "./env";

// SECURITY.md: no email or phone number may reach Sentry, whatever an error message happens to contain.

// The TLD must be letters, so package paths like next@16.4.4 in stack frames stay readable.
const emailPattern = /[\w.+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
// Separators people type between digits: space, dash, slash, dot, brackets, plus.
const sep = String.raw`[\s\-/().+]{0,2}`;
const phonePatterns = [
  // +36 / 0036 / any other +country, or the domestic 06 prefix, then 7–12 more digits.
  new RegExp(
    String.raw`(?<![\w+%])\(?(?:(?:\+|00)\d{1,3}|06)(?:${sep}\d){7,12}(?!\d)`,
    "g",
  ),
  // No prefix: a Hungarian mobile area code (20, 30, 31, 50, 70) and 7 digits.
  /(?<![\w+%])\(?(?:20|30|31|50|70)\)?[\s\-/.]?\d{3}[\s\-/.]?\d{2}[\s\-/.]?\d{2}(?!\d)/g,
];
// Field names whose value is personal or secret whatever its format.
const sensitiveKey =
  /e-?mail|phone|mobile|passw|passcode|secret|token|authorization|cookie|(?:^|[_-])(?:pin|otp|tel)(?:$|[_-])/i;
const droppedHeaders = new Set(["authorization", "cookie", "set-cookie"]);
// Span attributes the SDK fills from the request: IP, headers, bodies, query strings.
const droppedSpanAttribute =
  /^(?:user\.|client\.address|http\.request\.(?:header|body)|http\.response\.(?:header|body)|url\.query)/;
const maxDepth = 10;

function maskString(text: string): string {
  let masked = text.replace(emailPattern, "[email]");
  for (const pattern of phonePatterns)
    masked = masked.replace(pattern, "[phone]");
  return masked;
}

function scrubString(text: string): string {
  const masked = maskString(text);
  if (!text.includes("%")) return masked;
  // URLs and query strings arrive percent-encoded (anna%40example.com).
  try {
    const decoded = decodeURIComponent(masked);
    const decodedMasked = maskString(decoded);
    return decodedMasked === decoded ? masked : decodedMasked;
  } catch {
    return masked;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scrubValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return scrubString(value);
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  if (depth >= maxDepth || seen.has(value)) return "[Truncated]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => scrubValue(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      sensitiveKey.test(key) && inner !== null && typeof inner !== "object"
        ? "[Filtered]"
        : scrubValue(inner, depth + 1, seen),
    ]),
  );
}

function withoutKeys(record: unknown, drop: (key: string) => boolean): unknown {
  if (!isPlainObject(record)) return record;
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !drop(key)),
  );
}

/** Removes identity, cookies and auth headers, then masks emails and phone numbers in every string. */
export function scrubPii<E>(event: E): E {
  if (!isPlainObject(event)) return event;
  const copy: Record<string, unknown> = { ...event };

  if (isPlainObject(copy.user)) {
    const { id } = copy.user;
    copy.user = id === undefined ? {} : { id };
  }
  if (isPlainObject(copy.request)) {
    const request: Record<string, unknown> = { ...copy.request };
    delete request.cookies;
    request.headers = withoutKeys(request.headers, (name) =>
      droppedHeaders.has(name.toLowerCase()),
    );
    copy.request = request;
  }

  // The walk keeps the event's shape; only string leaves and sensitive fields change.
  return scrubValue(copy) as E;
}

/** Spans carry request data as attributes (streamed spans) or data (classic spans). */
export function scrubSpan<S>(span: S): S {
  if (!isPlainObject(span)) return span;
  const copy: Record<string, unknown> = { ...span };
  for (const field of ["attributes", "data"]) {
    copy[field] = withoutKeys(copy[field], (key) =>
      droppedSpanAttribute.test(key),
    );
  }
  return scrubValue(copy) as S;
}

type SentryEnvironment = "production" | "preview" | "development";

/** Shared Sentry.init options for every app; each app reports to its own Sentry project and also tags events with `app`. */
export function sentryOptions(
  app: AppName,
  { dsn, vercelEnv }: { dsn: string | undefined; vercelEnv?: string },
) {
  const environment: SentryEnvironment =
    vercelEnv === "production" || vercelEnv === "preview"
      ? vercelEnv
      : "development";

  // `satisfies` makes an unknown or renamed option a type error (v11 dropped sendDefaultPii silently).
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    // v11 collects user info, headers, bodies, query strings and local variables unless told not to.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ["user-agent", "content-type", "accept-language"] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    initialScope: { tags: { app } },
    tracesSampleRate: environment === "production" ? 0.1 : 1,
    beforeSend: scrubPii,
    beforeSendTransaction: scrubPii,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: <B>(breadcrumb: B): B => scrubValue(breadcrumb) as B,
  } satisfies Options;
}
