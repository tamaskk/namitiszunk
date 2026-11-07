import { z } from "zod";

// Error messages are i18n keys (packages/i18n), never prose; the client translates them.
// API schemas carry no transforms or defaults: the same schema must describe the wire format in OpenAPI.

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/, { error: "validation.objectId.invalid" });

/** An uploaded image: https on the Vercel Blob public host only, so no javascript:, data:, file: or internal address. */
export const blobUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/,
  error: "validation.url.invalid",
});

/** Integer forints, never floats (ARCHITECTURE §06). */
export const hufSchema = z
  .int({ error: "validation.huf.integer" })
  .min(0, { error: "validation.huf.min" });

// A format check only (+36 and 8-9 digits): this leaf package stays without libphonenumber-js, and @namitiszunk/core/notify validates with libphonenumber-js before sending.
export const huPhoneSchema = z
  .string()
  .regex(/^\+36\d{8,9}$/, { error: "validation.phone.invalid" });

export const nameSchema = z
  .string()
  .regex(/\S/, { error: "validation.name.required" })
  // Names reach SMS, e-mail headers and logs: no CR/LF or other control characters.
  .regex(/^[^\p{Cc}]*$/u, { error: "validation.name.invalid" })
  .max(100, { error: "validation.name.max" });

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "validation.time.invalid" });

export const dateTimeSchema = z.iso.datetime({
  error: "validation.dateTime.invalid",
});

// Same literals as packages/db models; packages/core/src/validators-sync.test.ts keeps them equal.
export const locales = ["hu", "en"] as const;
export const discountTypes = ["percent", "fixed"] as const;

/** Rejects a percent value above 100%; fixed amounts are forints and need no cap. */
export function percentAtMost100(value: {
  type: string;
  value: number;
}): boolean {
  return value.type !== "percent" || value.value <= 10_000;
}

/** The one /v1 error shape (T-029, apps/api/lib/error-response.ts): `messageKey` is an i18n key, `fields` maps input paths to reasons. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    messageKey: z.string(),
    fields: z.record(z.string(), z.string()),
  }),
});

/** Field path to i18n key, for a 400 response; Zod's own messages map to `validation.<issue code>`. */
export function fieldErrorKeys(error: z.ZodError): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    keys[path] ??= issue.message.startsWith("validation.")
      ? issue.message
      : `validation.${issue.code}`;
  }
  return keys;
}
