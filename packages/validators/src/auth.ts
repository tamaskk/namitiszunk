import { z } from "zod";

import { locales, nameSchema, objectIdSchema } from "./shared";
import { pinSchema } from "./staff";

// shortcut: Better Auth (T-030) validates its own endpoints; these cover our wrappers and the mobile API.
export const emailSignInInputSchema = z.object({
  email: z.email({ error: "validation.email.invalid" }),
});

export const emailOtpVerifyInputSchema = z.object({
  email: z.email({ error: "validation.email.invalid" }),
  otp: z.string().regex(/^\d{6}$/, { error: "validation.otp.invalid" }),
});

/** Name + PIN on the club tablet; the venue identifies which staff list to check. */
export const pinSignInInputSchema = z.object({
  venueId: objectIdSchema,
  displayName: nameSchema,
  pin: pinSchema,
});

export const sessionUserResponseSchema = z.object({
  id: objectIdSchema,
  email: z.string().optional(),
  name: z.string().optional(),
  locale: z.enum(locales),
});

export type PinSignInInput = z.infer<typeof pinSignInInputSchema>;
