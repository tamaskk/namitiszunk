import { z } from "zod";

import { nameSchema, objectIdSchema } from "./shared";

// Same literals as packages/db; packages/core/src/validators-sync.test.ts keeps them equal.
export const venueRoles = [
  "owner",
  "manager",
  "bartender",
  "vip_host",
] as const;
export const platformRoles = ["admin", "support", "finance"] as const;

export const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, { error: "validation.pin.invalid" });

/** Bartenders and VIP hosts may have no account: email is optional, a PIN is set separately. */
export const staffMemberInputSchema = z.object({
  displayName: nameSchema,
  role: z.enum(venueRoles, { error: "validation.role.invalid" }),
  email: z.email({ error: "validation.email.invalid" }).optional(),
});

export const setStaffPinInputSchema = z.object({ pin: pinSchema });

export const staffMemberResponseSchema = z.object({
  id: objectIdSchema,
  displayName: z.string(),
  role: z.enum(venueRoles),
  isActive: z.boolean(),
  hasAccount: z.boolean(),
});

export type StaffMemberInput = z.infer<typeof staffMemberInputSchema>;
export type StaffMemberResponse = z.infer<typeof staffMemberResponseSchema>;
