import { Schema, type InferSchemaType } from "mongoose";

import { defineModel, huf, objectId } from "./shared";

// Changed only through transitionOrder in packages/core (T-021), never by a direct update.
export const orderStatuses = [
  "awaiting_payment",
  "new",
  "preparing",
  "ready",
  "picked_up",
  "cancelled",
  "rejected",
  "expired",
  "refunded",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const paymentStatuses = [
  "requires_payment",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
] as const;

// Name, price and options are copied at order time so menu edits never rewrite history.
const orderItemSchema = new Schema({
  itemId: { type: objectId, ref: "Item", required: true },
  name: { type: String, required: true },
  nameEn: String,
  unitPriceHuf: huf(),
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  },
  options: [
    {
      groupName: { type: String, required: true },
      name: { type: String, required: true },
      priceDeltaHuf: huf({ default: 0 }),
    },
  ],
  lineTotalHuf: huf(),
  status: { type: String, enum: ["ok", "rejected"], default: "ok" },
});

const orderSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    barId: { type: objectId, ref: "Bar", required: true },
    zoneId: { type: objectId, ref: "Zone" },
    eventId: { type: objectId, ref: "Event" },
    userId: { type: objectId, ref: "User" },
    // Restarts per venue every business day (ARCHITECTURE §06); unique with businessDate.
    shortNumber: { type: Number, required: true, min: 1 },
    businessDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "{PATH} must be YYYY-MM-DD"],
    },
    status: {
      type: String,
      enum: orderStatuses,
      required: true,
      default: "awaiting_payment",
    },
    items: {
      type: [orderItemSchema],
      validate: [(v: unknown[]) => v.length > 0, "an order needs an item"],
    },
    subtotalHuf: huf(),
    serviceFeeHuf: huf({ default: 0 }),
    tipHuf: huf({ default: 0 }),
    discountHuf: huf({ default: 0 }),
    totalHuf: huf(),
    promoId: { type: objectId, ref: "Promo" },
    pickupCode: { type: String, required: true },
    guestTokenHash: { type: String, required: true },
    // Removed after 30 days by the retention job (T-028).
    guestPhone: String,
    smsRequested: { type: Boolean, default: false },
    isVip: { type: Boolean, default: false },
    acceptedTermsVersion: { type: String, required: true },
    rejectionReason: String,
    receiptEnteredAt: Date,
    receiptEnteredBy: { type: objectId, ref: "VenueMember" },
    paidAt: Date,
    acceptedAt: Date,
    readyAt: Date,
    pickedUpAt: Date,
  },
  { timestamps: true },
);
orderSchema.index(
  { venueId: 1, businessDate: 1, shortNumber: 1 },
  { unique: true },
);
// Bar view: the active orders of one bar, oldest first.
orderSchema.index({ venueId: 1, barId: 1, status: 1, createdAt: 1 });
export const Order = defineModel("Order", orderSchema);
export type OrderDoc = InferSchemaType<typeof orderSchema>;

// Short order number sequence per venue and business day (T-024 increments it).
const counterSchema = new Schema({
  venueId: { type: objectId, ref: "Venue", required: true },
  businessDate: { type: String, required: true },
  seq: { type: Number, required: true, min: 0, default: 0 },
});
counterSchema.index({ venueId: 1, businessDate: 1 }, { unique: true });
export const Counter = defineModel("Counter", counterSchema);
export type CounterDoc = InferSchemaType<typeof counterSchema>;

const paymentSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    orderId: { type: objectId, ref: "Order", required: true },
    stripePaymentIntentId: { type: String, required: true },
    amountHuf: huf(),
    applicationFeeHuf: huf({ default: 0 }),
    status: {
      type: String,
      enum: paymentStatuses,
      default: "requires_payment",
    },
  },
  { timestamps: true },
);
paymentSchema.index({ stripePaymentIntentId: 1 }, { unique: true });
export const Payment = defineModel("Payment", paymentSchema);
export type PaymentDoc = InferSchemaType<typeof paymentSchema>;

const refundSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    paymentId: { type: objectId, ref: "Payment", required: true },
    orderId: { type: objectId, ref: "Order", required: true },
    amountHuf: huf(),
    reason: { type: String, required: true },
    initiatedBy: {
      type: {
        type: String,
        enum: ["venue_member", "platform_member", "system"],
        required: true,
      },
      id: objectId,
    },
    stripeRefundId: String,
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
    },
  },
  { timestamps: true },
);
export const Refund = defineModel("Refund", refundSchema);
export type RefundDoc = InferSchemaType<typeof refundSchema>;

const promoSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    // percent: basis points; fixed: forints.
    value: huf(),
    maxUses: { type: Number, min: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    minOrderHuf: huf({ default: 0 }),
    validFrom: Date,
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Promo = defineModel("Promo", promoSchema);
export type PromoDoc = InferSchemaType<typeof promoSchema>;

const reviewSchema = new Schema(
  {
    venueId: { type: objectId, ref: "Venue", required: true },
    orderId: { type: objectId, ref: "Order", required: true },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    text: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);
export const Review = defineModel("Review", reviewSchema);
export type ReviewDoc = InferSchemaType<typeof reviewSchema>;
