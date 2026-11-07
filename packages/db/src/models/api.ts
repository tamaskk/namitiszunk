import { Schema, type InferSchemaType } from "mongoose";

import { defineModel } from "./shared";

// One document per client, endpoint and fixed window (T-029). The TTL index clears old windows.
const rateLimitSchema = new Schema({
  // sha256 of endpoint + IP + window, so no raw IP address is stored.
  key: { type: String, required: true },
  count: { type: Number, required: true, min: 0, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateLimitSchema.index({ key: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimit = defineModel(
  "RateLimit",
  rateLimitSchema,
  "rateLimits",
);
export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

// Stored POST responses for the Idempotency-Key header, kept 24 hours (T-029).
const idempotencyKeySchema = new Schema({
  // sha256 of endpoint + actor + client key.
  key: { type: String, required: true },
  // sha256 of the request body: the same key with another body is a client error.
  requestHash: { type: String, required: true },
  // Unset while the first request is still running.
  response: {
    status: Number,
    contentType: String,
    body: String,
  },
  expiresAt: { type: Date, required: true },
});
idempotencyKeySchema.index({ key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const IdempotencyKey = defineModel(
  "IdempotencyKey",
  idempotencyKeySchema,
  "idempotencyKeys",
);
export type IdempotencyKeyDoc = InferSchemaType<typeof idempotencyKeySchema>;

// Processed Stripe webhook events (T-032, T-033): the unique id makes every handler run once.
const stripeEventSchema = new Schema({
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  processedAt: { type: Date, required: true, default: () => new Date() },
});
stripeEventSchema.index({ eventId: 1 }, { unique: true });
// Stripe retries a delivery for 3 days, so 30 days of ids is plenty.
stripeEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);
export const StripeEvent = defineModel(
  "StripeEvent",
  stripeEventSchema,
  "stripeEvents",
);
export type StripeEventDoc = InferSchemaType<typeof stripeEventSchema>;
