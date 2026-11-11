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

// Staff module (T-057). A new PIN is exactly 4 digits; sign-in still accepts the 4-6 digit PINs set before.
export const newPinSchema = z
  .string()
  .regex(/^\d{4}$/, { error: "validation.pin.fourDigits" });

export const addPinMemberInputSchema = z.object({
  name: nameSchema,
  role: z.enum(["bartender", "vip_host"], { error: "validation.role.invalid" }),
  pin: newPinSchema,
});

export const changeMemberPinInputSchema = z.object({
  memberId: objectIdSchema,
  pin: newPinSchema,
});

export const setMemberActiveInputSchema = z.object({
  memberId: objectIdSchema,
  active: z.boolean(),
});

export const revokeDeviceInputSchema = z.object({ deviceId: objectIdSchema });

export const staffInviteInputSchema = z.object({
  email: z.email({ error: "validation.email.invalid" }),
  role: z.enum(["manager", "owner"], { error: "validation.role.invalid" }),
});

export const staffLogQuerySchema = z.object({
  date: z.iso.date().optional(),
});
