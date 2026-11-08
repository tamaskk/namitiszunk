import { Schema, type InferSchemaType } from "mongoose";

import { capPercent, defineModel, huf, objectId } from "./shared";

export const venueStatuses = ["draft", "active", "suspended"] as const;
export const serviceFeeTypes = ["none", "percent", "fixed"] as const;
export const zoneTypes = ["bar_area", "vip_table"] as const;

const timeOfDay = {
  type: String,
  match: [/^([01]\d|2[0-3]):[0-5]\d$/, "{PATH} must be HH:mm"] as [
    RegExp,
    string,
  ],
};

// One opening of the week (T-048): ISO day, local times; a close at or before the open is the next morning.
const openingHoursSchema = new Schema(
  {
    day: { type: Number, min: 1, max: 7, required: true },
    open: { ...timeOfDay, required: true },
    close: { ...timeOfDay, required: true },
  },
  { _id: false },
);

const orderRulesSchema = new Schema(
  {
    autoAccept: { type: Boolean, default: true },
    pickupDeadlineMinutes: { type: Number, min: 15, max: 60, default: 30 },
    refundOnExpiry: { type: Boolean, default: false },
    maxItemsPerOrder: { type: Number, min: 1 },
    minimumOrderHuf: huf({ default: 0 }),
    lastOrderMinutesBeforeClose: {
      type: Number,
      min: 0,
      max: 120,
      default: 15,
    },
    serviceFee: {
      type: { type: String, enum: serviceFeeTypes, default: "none" },
      // percent: basis points (1250 = 12.5%); fixed: forints. Integers either way.
      value: huf({ default: 0 }),
    },
    smsEnabled: { type: Boolean, default: false },
  },
  { _id: false },
);
capPercent(orderRulesSchema, "serviceFee.type", "serviceFee.value");

const venueSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: { street: String, city: String, postalCode: String },
    company: { name: String, taxNumber: String, registrationNumber: String },
    // Where guest problem reports go (T-046); onboarding (T-068) makes it required.
    contactEmail: { type: String, trim: true, lowercase: true },
    timezone: { type: String, default: "Europe/Budapest" },
    currency: { type: String, enum: ["HUF"], default: "HUF" },
    businessDayStart: { ...timeOfDay, default: "06:00" },
    // Empty: the bars' open/closed switch alone decides when guests can order.
    openingHours: { type: [openingHoursSchema], default: undefined },
    branding: { logoUrl: String, coverUrl: String },
    stripeAccountId: {
      type: String,
      match: [/^acct_\w+$/, "{PATH} must be a Stripe account id"],
    },
    // Mirrored from the connected account by the account.updated webhook (T-032).
    chargesEnabled: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },
    /** Stripe requirement keys still due (`requirements.currently_due`), shown to the Owner. */
    stripeRequirementsDue: { type: [String], default: undefined },
    status: { type: String, enum: venueStatuses, default: "draft" },
    orderRules: { type: orderRulesSchema, default: () => ({}) },
  },
  { timestamps: true },
);
venueSchema.index({ slug: 1 }, { unique: true });
// One connected account per venue, or one club's money lands with another.
venueSchema.index(
  { stripeAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripeAccountId: { $type: "string" } },
  },
);
export const Venue = defineModel("Venue", venueSchema);
export type VenueDoc = InferSchemaType<typeof venueSchema>;

const barSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    name: { type: String, required: true, trim: true },
    isOpen: { type: Boolean, default: false },
    pausedUntil: Date,
    maxActiveOrders: { type: Number, min: 1 },
  },
  { timestamps: true },
);
export const Bar = defineModel("Bar", barSchema);
export type BarDoc = InferSchemaType<typeof barSchema>;

const zoneSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    barId: { type: objectId, ref: "Bar", required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: zoneTypes, default: "bar_area" },
  },
  { timestamps: true },
);
export const Zone = defineModel("Zone", zoneSchema);
export type ZoneDoc = InferSchemaType<typeof zoneSchema>;

const qrCodeSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    barId: { type: objectId, ref: "Bar" },
    zoneId: { type: objectId, ref: "Zone" },
    code: { type: String, required: true },
    scanCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);
qrCodeSchema.index({ code: 1 }, { unique: true });
export const QrCode = defineModel("QrCode", qrCodeSchema);
export type QrCodeDoc = InferSchemaType<typeof qrCodeSchema>;

const eventSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    name: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    coverUrl: String,
    menuOverride: {
      hiddenItemIds: [{ type: objectId, ref: "Item" }],
      prices: [{ itemId: { type: objectId, ref: "Item" }, priceHuf: huf() }],
    },
  },
  { timestamps: true },
);
export const Event = defineModel("Event", eventSchema);
export type EventDoc = InferSchemaType<typeof eventSchema>;
