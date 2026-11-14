import "server-only";

import { type ClientSession, Order, Promo } from "@namitiszunk/db";
import type { PromoInput } from "@namitiszunk/validators";
import { Types } from "mongoose";

import {
  hitRateLimit,
  type RateLimitRule,
  undoRateLimitHit,
} from "../api/rate-limit";
import { ipPrefixKey } from "../api/client-ip";
import { audit, auditActorOf } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { inTransaction } from "../menu/admin-menu";
import { isDuplicateKey } from "../orders/short-number";
import type { PromoRule } from "../pricing/calculate-order";

// Promo codes (T-060). A shared code can be used by anyone, so maxUses is the protection: the use is
// reserved atomically when the order is created and released when its payment is abandoned.

/**
 * Each refusal is an `apiErrors.<code>` key the checkout shows. An unknown, not yet started or stopped
 * code is `promo_invalid`, so a guest never learns that a stopped code exists.
 */
export const promoErrorCodes = [
  "promo_invalid",
  "promo_expired",
  "promo_below_minimum",
  "promo_used_up",
] as const;
export type PromoErrorCode = (typeof promoErrorCodes)[number];

export type ValidPromo = PromoRule & { id: Types.ObjectId };

// The model stores codes upper-case, so a lookup in any case finds the same code.
const normalize = (code: string) => code.trim().toUpperCase();

/**
 * The checkout's check (T-042): the code exists at the venue, is active, inside its period, the
 * subtotal reaches its minimum and a use is left. Throws 409 with the matching code otherwise.
 * The use itself is taken only when the order is paid (`takePromoUse` in `transition()`).
 */
export async function validatePromo(
  venueId: string | Types.ObjectId,
  code: string,
  subtotalHuf: number,
  now: Date = new Date(),
): Promise<ValidPromo> {
  const promo = await Promo.findOne({ venueId, code: normalize(code) })
    .select(
      "type value maxUses usedCount minOrderHuf validFrom validTo isActive",
    )
    .lean();
  if (!promo || !promo.isActive || (promo.validFrom && promo.validFrom > now)) {
    throw new ConflictError("promo_invalid");
  }
  if (promo.validTo && promo.validTo <= now) {
    throw new ConflictError("promo_expired");
  }
  if (subtotalHuf < (promo.minOrderHuf ?? 0)) {
    throw new ConflictError("promo_below_minimum");
  }
  if (promo.maxUses != null && (promo.usedCount ?? 0) >= promo.maxUses) {
    throw new ConflictError("promo_used_up");
  }
  return {
    id: promo._id,
    type: promo.type as PromoRule["type"],
    value: promo.value,
  };
}

type Bucket = { key: string; rule: RateLimitRule };

/**
 * Counts one attempt in every bucket, all in the same wall-clock window (not the pricing `now`: the TTL
 * index drops counters whose window has passed). Throws 429 when any bucket is full; a refused attempt
 * is taken back everywhere, so a full device bucket never charges the guests sharing its address.
 * Returns the undo for an attempt that should not count after all.
 */
async function countAttempt(buckets: Bucket[]): Promise<() => Promise<void>> {
  const at = Date.now();
  const undo = async () => {
    await Promise.all(buckets.map((b) => undoRateLimitHit(b.key, b.rule, at)));
  };
  const hits = await Promise.all(
    buckets.map((b) => hitRateLimit(b.key, b.rule, at)),
  );
  if (hits.some(Boolean)) {
    await undo();
    throw new AppError(429, "rate_limited");
  }
  return undo;
}

/** A device's buckets, plus its address as a loose backstop when apps/api knows it. */
function deviceBuckets(
  prefix: string,
  rules: { device: RateLimitRule; ip: RateLimitRule },
  deviceId: string | undefined,
  clientIp: string | undefined,
): Bucket[] {
  // The validators refuse a code without a device id; a caller that skips them is refused here too.
  if (!deviceId)
    throw new AppError(400, "validation_failed", { deviceId: "required" });
  return [
    { key: `${prefix}|device:${deviceId}`, rule: rules.device },
    ...(clientIp
      ? [{ key: `${prefix}|ip:${ipPrefixKey(clientIp)}`, rule: rules.ip }]
      : []),
  ];
}

/**
 * Unknown codes per 10 minutes. Per device, with a loose per-address backstop for a client that
 * rotates its device id: a club crowd shares one wifi address. No venue-wide bucket, since anyone
 * with many addresses could fill it and switch every code off; a code's length is the defence there.
 */
export const PROMO_GUESS_LIMITS = {
  device: { limit: 10, windowSeconds: 600 },
  ip: { limit: 50, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * `validatePromo` behind the guess limiter, for the quote and createOrder. Only an unknown code
 * (`promo_invalid`) counts as a guess: a real code refused for the cart, its period or its uses is
 * taken back, so a guest fixing the cart does not use up attempts.
 */
export async function checkPromo(
  venueId: Types.ObjectId,
  code: string,
  subtotalHuf: number,
  now: Date,
  deviceId: string | undefined,
  clientIp?: string,
): Promise<ValidPromo> {
  const undo = await countAttempt(
    deviceBuckets("promo-guess", PROMO_GUESS_LIMITS, deviceId, clientIp),
  );
  let promo: ValidPromo;
  try {
    promo = await validatePromo(venueId, code, subtotalHuf, now);
  } catch (error) {
    if (!(error instanceof AppError && error.code === "promo_invalid")) {
      await undo();
    }
    throw error;
  }
  await undo();
  return promo;
}

/**
 * Takes one use when the order's payment succeeds, in that transition's transaction. Unpaid orders
 * hold nothing, so nobody can block a code with orders they never pay. Unconditional on purpose:
 * guests paying at the same moment for the last use may overshoot `maxUses` by a few, because their
 * discount is already in the price they paid; the checkout refuses the code once it is used up.
 */
export async function takePromoUse(
  promoId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  await Promo.updateOne(
    { _id: promoId },
    { $inc: { usedCount: 1 } },
    { session },
  );
}

/** Gives the use back when the guest cancels a paid order before acceptance (fully refunded). */
export async function releasePromo(
  promoId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  await Promo.updateOne(
    { _id: promoId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    { session },
  );
}

export type AdminPromo = {
  id: string;
  code: string;
  type: PromoRule["type"];
  value: number;
  maxUses: number | null;
  usedCount: number;
  minOrderHuf: number;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  /** Past its validTo: guests get promo_expired whatever isActive says. */
  isExpired: boolean;
  /** Paid orders with the code. */
  paidOrders: number;
  totalDiscountHuf: number;
  /** Average subtotal (before the discount) of those orders; 0 without any. */
  averageBasketHuf: number;
};

/** The Promotions module (T-060): every code of the venue, newest first, with its usage. Owner only. */
export async function listPromos(
  actor: Actor,
  venueId: string,
  now: Date = new Date(),
): Promise<AdminPromo[]> {
  requirePermission(actor, "venue.editSettings", { venueId });
  const promos = await Promo.find({ venueId })
    .sort({ createdAt: -1 })
    .select(
      "code type value maxUses usedCount minOrderHuf validFrom validTo isActive",
    )
    .lean();
  if (promos.length === 0) return [];
  const stats = await Order.aggregate<{
    _id: Types.ObjectId;
    orders: number;
    discountHuf: number;
    subtotalHuf: number;
  }>([
    {
      $match: {
        venueId: new Types.ObjectId(venueId),
        promoId: { $in: promos.map((p) => p._id) },
        paidAt: { $type: "date" },
      },
    },
    {
      $group: {
        _id: "$promoId",
        orders: { $sum: 1 },
        discountHuf: { $sum: "$discountHuf" },
        subtotalHuf: { $sum: "$subtotalHuf" },
      },
    },
  ]);
  const byPromo = new Map(stats.map((s) => [String(s._id), s]));
  return promos.map((promo) => {
    const s = byPromo.get(String(promo._id));
    return {
      id: String(promo._id),
      code: promo.code,
      type: promo.type as PromoRule["type"],
      value: promo.value,
      maxUses: promo.maxUses ?? null,
      usedCount: promo.usedCount ?? 0,
      minOrderHuf: promo.minOrderHuf ?? 0,
      validFrom: promo.validFrom?.toISOString() ?? null,
      validTo: promo.validTo?.toISOString() ?? null,
      isActive: promo.isActive ?? true,
      isExpired: promo.validTo != null && promo.validTo <= now,
      paidOrders: s?.orders ?? 0,
      totalDiscountHuf: s?.discountHuf ?? 0,
      averageBasketHuf: s ? Math.round(s.subtotalHuf / s.orders) : 0,
    };
  });
}

export async function createPromo(
  actor: Actor,
  venueId: string,
  input: PromoInput,
): Promise<{ id: string }> {
  requirePermission(actor, "venue.editSettings", { venueId });
  const code = normalize(input.code);
  try {
    return await inTransaction(async (session) => {
      const [promo] = await Promo.create(
        [
          {
            venueId,
            code,
            type: input.type,
            value: input.value,
            maxUses: input.maxUses,
            minOrderHuf: input.minOrderHuf ?? 0,
            validFrom: input.validFrom,
            validTo: input.validTo,
            isActive: input.isActive ?? true,
          },
        ],
        { session },
      );
      const id = String(promo!._id);
      await audit(session, {
        actor: auditActorOf(actor),
        venueId,
        action: "promos.created",
        target: { type: "promo", id },
        after: { ...input, code },
      });
      return { id };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(409, "promo_code_taken", {
        code: "validation.promoCode.taken",
      });
    }
    throw error;
  }
}

/** Stops or restarts a code. A stopped code keeps its uses and statistics. */
export async function setPromoActive(
  actor: Actor,
  venueId: string,
  promoId: string,
  isActive: boolean,
): Promise<void> {
  requirePermission(actor, "venue.editSettings", { venueId });
  await inTransaction(async (session) => {
    const before = await Promo.findOneAndUpdate(
      { _id: promoId, venueId },
      { $set: { isActive } },
      { session },
    )
      .select("isActive")
      .lean();
    if (!before) throw new NotFoundError();
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: isActive ? "promos.restarted" : "promos.stopped",
      target: { type: "promo", id: promoId },
      before: { isActive: before.isActive ?? true },
      after: { isActive },
    });
  });
}
