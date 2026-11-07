import "server-only";

import {
  AuditLog,
  type AuditLogDoc,
  type ClientSession,
} from "@namitiszunk/db";

// Mongoose casts hex strings; ObjectIds come straight from loaded documents.
type Id = NonNullable<AuditLogDoc["target"]>["id"] | string;

export type AuditActor = {
  type: "user" | "venue_member" | "platform_member" | "system";
  id?: Id;
  name?: string;
};

export type AuditEntry = {
  /** For a staff action this is the active PIN holder, not the venue's tablet account. */
  actor: AuditActor;
  impersonatedBy?: { id: Id; name?: string };
  venueId?: Id;
  action: string;
  target: { type: string; id: Id };
  before?: unknown;
  after?: unknown;
};

// Contact data, PINs and credentials never reach the log (docs/fejlesztesi-terv.md #26, docs/SECURITY.md).
// Matched per camelCase / snake_case word, so `guestPhone` is dropped but `microphone` is kept.
const PERSONAL_WORDS = new Set([
  "phone",
  "tel",
  "mobile",
  "msisdn",
  "email",
  "mail",
  "pin",
  "password",
  "passwd",
  "token",
  "secret",
  "otp",
]);

function isPersonalKey(key: string): boolean {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => PERSONAL_WORDS.has(word));
}

// Values BSON stores as leaves: dates, ObjectIds, Decimal128, binary.
function isLeaf(value: object): boolean {
  return (
    value instanceof Date || value instanceof Uint8Array || "_bsontype" in value
  );
}

/**
 * Deep copy without personal-data keys. Maps and class instances are copied as plain
 * objects, because BSON would otherwise store their fields unfiltered.
 */
export function stripPersonalData(value: unknown): unknown {
  return strip(value, new Set());
}

function strip(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value !== "object" || isLeaf(value)) {
    return value;
  }
  // A cycle would overflow the stack and abort the caller's transaction.
  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => strip(v, ancestors));
    if ("toObject" in value && typeof value.toObject === "function") {
      return strip((value.toObject as () => unknown)(), ancestors);
    }
    const entries =
      value instanceof Map
        ? [...value.entries()].map(([k, v]) => [String(k), v] as const)
        : Object.entries(value);
    return Object.fromEntries(
      entries
        .filter(([key]) => !isPersonalKey(key))
        .map(([key, inner]) => [key, strip(inner, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Writes the audit entry inside the caller's transaction, so the change and its log
 * commit or roll back together.
 */
export async function audit(
  session: ClientSession,
  entry: AuditEntry,
): Promise<void> {
  if (!session.inTransaction()) {
    throw new Error("audit() must run inside the transaction of the change");
  }
  await AuditLog.create(
    [
      {
        ...entry,
        before: stripPersonalData(entry.before),
        after: stripPersonalData(entry.after),
      },
    ],
    { session },
  );
}
