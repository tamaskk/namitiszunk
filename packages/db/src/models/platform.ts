import { Schema, type InferSchemaType } from "mongoose";

import { defineModel, objectId } from "./shared";

export const leadStatuses = [
  "new",
  "contacted",
  "demo",
  "won",
  "lost",
] as const;

// No venueId = the platform default. Basis points keep the rate an integer (800 = 8%).
const feeRuleSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue" },
    commissionBps: {
      type: Number,
      required: true,
      min: 0,
      max: 10000,
      validate: Number.isSafeInteger,
    },
    validFrom: { type: Date, required: true },
  },
  { timestamps: true },
);
export const FeeRule = defineModel("FeeRule", feeRuleSchema);
export type FeeRuleDoc = InferSchemaType<typeof feeRuleSchema>;

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    venueName: String,
    city: String,
    message: String,
    status: { type: String, enum: leadStatuses, default: "new" },
    assigneeId: { type: objectId, ref: "PlatformMember" },
    notes: [
      {
        authorId: { type: objectId, ref: "PlatformMember", required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
export const Lead = defineModel("Lead", leadSchema);
export type LeadDoc = InferSchemaType<typeof leadSchema>;

const auditLogSchema = new Schema(
  {
    actor: {
      type: {
        type: String,
        enum: ["user", "venue_member", "platform_member", "system"],
        required: true,
      },
      id: objectId,
    },
    venueId: { type: objectId, ref: "Venue" },
    action: { type: String, required: true },
    target: {
      type: { type: String, required: true },
      id: { type: objectId, required: true },
    },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ "target.type": 1, "target.id": 1, createdAt: 1 });
export const AuditLog = defineModel("AuditLog", auditLogSchema);
export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
