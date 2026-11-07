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

// Phone numbers, emails and PIN hashes never reach the log (docs/fejlesztesi-terv.md #26).
const PERSONAL_KEY = /phone|e-?mail|pin_?hash/i;

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep copy without personal-data keys; ids, dates and other non-plain values pass through. */
export function stripPersonalData(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripPersonalData);
  // A hydrated Mongoose document would otherwise slip through as a non-plain object.
  if ("toObject" in value && typeof value.toObject === "function") {
    return stripPersonalData((value.toObject as () => unknown)());
  }
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PERSONAL_KEY.test(key))
      .map(([key, inner]) => [key, stripPersonalData(inner)]),
  );
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
