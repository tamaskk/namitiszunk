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
