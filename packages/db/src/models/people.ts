import { Schema, type InferSchemaType } from "mongoose";

import { defineModel, objectId } from "./shared";

export const locales = ["hu", "en"] as const;
export const venueRoles = [
  "owner",
  "manager",
  "bartender",
  "vip_host",
] as const;
export const platformRoles = ["admin", "support", "finance"] as const;

// Better Auth (T-030) owns this collection and its auth fields; strict: false keeps them intact.
const userSchema = new Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    name: { type: String, trim: true },
    phone: String,
    birthDate: Date,
    locale: { type: String, enum: locales, default: "hu" },
    marketingConsentAt: Date,
  },
  { collection: "user", strict: false, timestamps: true },
);
export const User = defineModel("User", userSchema);
export type UserDoc = InferSchemaType<typeof userSchema>;

// Bartenders and VIP hosts sign in with name + PIN on the club tablet, so userId is optional.
const venueMemberSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    userId: { type: objectId, ref: "User" },
    role: { type: String, enum: venueRoles, required: true },
    displayName: { type: String, required: true, trim: true },
    pinHash: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const VenueMember = defineModel("VenueMember", venueMemberSchema);
export type VenueMemberDoc = InferSchemaType<typeof venueMemberSchema>;

const platformMemberSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true },
    role: { type: String, enum: platformRoles, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const PlatformMember = defineModel(
  "PlatformMember",
  platformMemberSchema,
);
export type PlatformMemberDoc = InferSchemaType<typeof platformMemberSchema>;

const deviceTokenSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ["ios", "android"], required: true },
  },
  { timestamps: true },
);
export const DeviceToken = defineModel("DeviceToken", deviceTokenSchema);
export type DeviceTokenDoc = InferSchemaType<typeof deviceTokenSchema>;
