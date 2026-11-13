import "server-only";

import { type ClientSession, Order, Promo } from "@namitiszunk/db";
import type { PromoInput } from "@namitiszunk/validators";
import { Types } from "mongoose";

import { audit, auditActorOf } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { inTransaction } from "../menu/admin-menu";
import { isDuplicateKey } from "../orders/short-number";
import type { PromoRule } from "../pricing/calculate-order";

// Promo codes (T-060). A shared code can be used by anyone, so maxUses is the protection: the use is
// reserved atomically when the order is created and released when its payment is abandoned.

/** Each refusal is an `apiErrors.<code>` key the checkout shows. An unknown or not yet started code is `promo_invalid`. */
export const promoErrorCodes = [
  "promo_invalid",
  "promo_expired",
  "promo_stopped",
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
 * The use itself is taken only by `reservePromo` inside createOrder's transaction.
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
  if (!promo || (promo.validFrom && promo.validFrom > now)) {
    throw new ConflictError("promo_invalid");
  }
  if (!promo.isActive) throw new ConflictError("promo_stopped");
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

/**
 * Takes one use in the caller's transaction. Conditional on `usedCount < maxUses`, so two parallel
 * orders for the last use give one success; the other's transaction aborts with 409 promo_used_up.
 */
export async function reservePromo(
  promoId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const reserved = await Promo.findOneAndUpdate(
    {
      _id: promoId,
      isActive: true,
      $or: [{ maxUses: null }, { $expr: { $lt: ["$usedCount", "$maxUses"] } }],
    },
    { $inc: { usedCount: 1 } },
    { session },
  )
    .select("_id")
    .lean();
  if (!reserved) throw new ConflictError("promo_used_up");
}

/** Gives the use back when an order's payment is abandoned (payment_timeout), in that transition's transaction. */
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
  // shortcut: no index on Order.promoId (index changes need approval); fine at pilot volume, add { venueId, promoId } if the page slows.
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
