import "server-only";

import {
  Bar,
  DeviceToken,
  Item,
  Order,
  PlatformMember,
  Review,
  User,
  Venue,
  VenueMember,
  Zone,
} from "@namitiszunk/db";
import type { AccountOrder, ReorderResponse } from "@namitiszunk/validators";
import { type ClientSession, isValidObjectId, Types } from "mongoose";

import { audit } from "../audit/audit";
import type { Actor } from "../auth/permissions";
import { validateSelection } from "../cart/selection";
import { ConflictError, NotFoundError } from "../errors";
import { publicModifierGroups } from "../menu/public-menu";
import { formatShortNumber } from "../orders/short-number";

type UserActor = Extract<Actor, { kind: "user" }>;
type GuestActor = Extract<Actor, { kind: "guest" }>;

const HISTORY_LIMIT = 100;

const userObjectId = (actor: UserActor) => new Types.ObjectId(actor.userId);

/**
 * Attaches the device's orders to the signed-in guest (T-047). Only an order whose stored token hash
 * matches and that has no account yet moves; nothing is matched by e-mail, which would reveal orders
 * placed on another device.
 */
export async function claimDeviceOrders(
  actor: UserActor,
  claims: readonly { orderId: string; tokenHash: string }[],
): Promise<{ claimed: number }> {
  if (claims.length === 0) return { claimed: 0 };
  const result = await Order.bulkWrite(
    claims.map((claim) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(claim.orderId),
          guestTokenHash: claim.tokenHash,
          userId: { $exists: false },
        },
        update: { $set: { userId: userObjectId(actor) } },
      },
    })),
    { ordered: false },
  );
  return { claimed: result.modifiedCount };
}

/** The signed-in guest's orders, newest first, for /fiok. */
export async function listAccountOrders(
  actor: UserActor,
): Promise<AccountOrder[]> {
  const orders = await Order.find({ userId: userObjectId(actor) })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("venueId shortNumber status items totalHuf createdAt")
    .lean();
  const venues = await Venue.find({
    _id: { $in: [...new Set(orders.map((o) => String(o.venueId)))] },
  })
    .select("name slug")
    .lean();
  const venueById = new Map(venues.map((v) => [String(v._id), v]));
  return orders.map((order) => {
    const venue = venueById.get(String(order.venueId));
    return {
      id: String(order._id),
      number: formatShortNumber(order.shortNumber),
      venueName: venue?.name ?? "",
      venueSlug: venue?.slug ?? "",
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      totalHuf: order.totalHuf,
      items: order.items.map((item) => ({
        name: item.name,
        ...(item.nameEn ? { nameEn: item.nameEn } : {}),
        quantity: item.quantity,
      })),
    };
  });
}

/** Everything personal tied to the account, as one JSON document (GDPR access and portability). */
export async function exportAccountData(actor: UserActor) {
  const userId = userObjectId(actor);
  const user = await User.findById(userId)
    .select("email name phone birthDate locale marketingConsentAt createdAt")
    .lean();
  if (!user) throw new NotFoundError();
  const [logins, orders] = await Promise.all([
    User.db
      .collection("account")
      .find({ userId: { $in: [userId, actor.userId] } })
      .project<{ providerId: string; createdAt?: Date }>({
        _id: 0,
        providerId: 1,
        createdAt: 1,
      })
      .toArray(),
    Order.find({ userId })
      .sort({ createdAt: -1 })
      .select(
        "venueId shortNumber businessDate status items subtotalHuf discountHuf serviceFeeHuf tipHuf totalHuf guestPhone problemReports createdAt",
      )
      .lean(),
  ]);
  const reviews = await Review.find({
    orderId: { $in: orders.map((o) => o._id) },
  })
    .select("orderId stars text createdAt")
    .lean();
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email ?? null,
      name: user.name ?? null,
      phone: user.phone ?? null,
      birthDate: user.birthDate?.toISOString() ?? null,
      locale: user.locale,
      marketingConsentAt: user.marketingConsentAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    logins: logins.map((login) => ({
      provider: login.providerId,
      linkedAt: login.createdAt?.toISOString() ?? null,
    })),
    orders: orders.map((order) => ({
      id: String(order._id),
      number: formatShortNumber(order.shortNumber),
      venueId: String(order.venueId),
      businessDate: order.businessDate,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        options: item.options?.map((o) => o.name) ?? [],
        lineTotalHuf: item.lineTotalHuf,
      })),
      subtotalHuf: order.subtotalHuf,
      discountHuf: order.discountHuf ?? 0,
      serviceFeeHuf: order.serviceFeeHuf ?? 0,
      tipHuf: order.tipHuf ?? 0,
      totalHuf: order.totalHuf,
      guestPhone: order.guestPhone ?? null,
      problemReports: (order.problemReports ?? []).map((report) => ({
        category: report.category,
        message: report.message ?? null,
        email: report.email ?? null,
        createdAt: report.createdAt.toISOString(),
      })),
    })),
    reviews: reviews.map((review) => ({
      orderId: String(review.orderId),
      stars: review.stars,
      text: review.text ?? null,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;

/**
 * Deletes the guest account (T-047): the User, its sessions, logins and push tokens go; orders stay
 * for the venue's books (8 years, T-028) without the account. A staff or platform user cannot delete
 * here: their venue or platform access must be removed first.
 */
export async function deleteAccount(
  actor: UserActor,
): Promise<{ ordersDetached: number }> {
  const userId = userObjectId(actor);
  const [venueMember, platformMember] = await Promise.all([
    VenueMember.exists({ userId }),
    PlatformMember.exists({ userId }),
  ]);
  if (venueMember || platformMember) throw new ConflictError("staff_account");

  const session = await Order.startSession();
  try {
    return await session.withTransaction(async () => {
      const ordersDetached = await removeAccount(userId, session);
      await audit(session, {
        actor: { type: "user", id: userId },
        action: "account.deleted",
        target: { type: "user", id: userId },
        after: { ordersDetached },
      });
      return { ordersDetached };
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Removes a user, its sessions, logins and push tokens, and detaches its orders, inside the caller's
 * transaction. Shared by the guest's own deletion and retention (T-028); callers check staff membership.
 * Returns the number of orders detached.
 */
export async function removeAccount(
  userId: Types.ObjectId,
  session: ClientSession,
): Promise<number> {
  // Better Auth may store the user id as an ObjectId or a string, depending on the adapter version.
  const byUser = { userId: { $in: [userId, String(userId)] } };
  const detached = await Order.updateMany(
    { userId },
    { $unset: { userId: 1 } },
    { session },
  );
  await DeviceToken.deleteMany({ userId }, { session });
  await User.db.collection("session").deleteMany(byUser, { session });
  await User.db.collection("account").deleteMany(byUser, { session });
  // A guest may have set up TOTP (the plugin runs in every app): its secret and backup codes go too.
  await User.db.collection("twoFactor").deleteMany(byUser, { session });
  const removed = await User.deleteOne({ _id: userId }, { session });
  if (removed.deletedCount === 0) throw new NotFoundError();
  return detached.modifiedCount;
}

/**
 * "Rendeld újra" (T-045, T-047): the order's lines as a cart at today's prices. A line whose item is
 * sold out, archived, VIP-only, no longer at that bar, or whose options changed is skipped and named.
 */
export async function reorder(
  actor: GuestActor | UserActor,
  orderId: string,
): Promise<ReorderResponse> {
  if (!isValidObjectId(orderId)) throw new NotFoundError();
  const order = await Order.findById(orderId)
    .select("venueId barId zoneId items userId +guestTokenHash")
    .lean();
  const owns =
    order &&
    (actor.kind === "guest"
      ? actor.guestId !== "" && order.guestTokenHash === actor.guestId
      : order.userId !== undefined && String(order.userId) === actor.userId);
  // Not the caller's order and no order at all look the same: 404.
  if (!order || !owns) throw new NotFoundError();

  const [venue, bar, zone] = await Promise.all([
    Venue.findById(order.venueId).select("slug").lean(),
    Bar.exists({ _id: order.barId, venueId: order.venueId }),
    order.zoneId
      ? Zone.findOne({ _id: order.zoneId, barId: order.barId })
          .select("type")
          .lean()
      : null,
  ]);
  // The bar is gone: there is no menu to send the guest back to.
  if (!venue || !bar) throw new NotFoundError();
  // A removed table is not a VIP table any more; the guest orders from the bar's plain menu.
  const isVip = zone?.type === "vip_table";
  const items = await Item.find({
    _id: { $in: order.items.map((line) => line.itemId) },
    venueId: order.venueId,
  })
    .select(
      "name nameEn priceHuf isAvailable archivedAt vipOnly barIds modifierGroups",
    )
    .lean();
  const byId = new Map(items.map((item) => [String(item._id), item]));

  const lines: ReorderResponse["lines"] = [];
  const skipped: string[] = [];
  for (const line of order.items) {
    const item = byId.get(String(line.itemId));
    const sellable =
      item &&
      item.isAvailable !== false &&
      !item.archivedAt &&
      (!item.vipOnly || isVip) &&
      (!item.barIds?.length ||
        item.barIds.some((id) => String(id) === String(order.barId)));
    // The order stores option names, not ids: find each by group and name on today's item.
    const groups = sellable
      ? publicModifierGroups(item.modifierGroups, "hu")
      : [];
    const modifiers = (line.options ?? []).map((option) =>
      groups
        .find((group) => group.name === option.groupName)
        ?.modifiers.find((m) => m.name === option.name),
    );
    // A group made required or a changed limit since then would fail at checkout: skip it now.
    const valid =
      sellable &&
      modifiers.every((m) => m !== undefined) &&
      validateSelection(
        groups,
        modifiers.map((m) => m!.id),
      ).length === 0;
    if (!valid) {
      skipped.push(line.name);
      continue;
    }
    const chosen = modifiers.filter((m) => m !== undefined);
    lines.push({
      itemId: String(item._id),
      name: item.name,
      ...(item.nameEn ? { nameEn: item.nameEn } : {}),
      unitPriceHuf:
        item.priceHuf + chosen.reduce((sum, m) => sum + m.priceDeltaHuf, 0),
      quantity: line.quantity,
      modifierIds: chosen.map((m) => m.id),
      options: chosen.map((m) => m.name),
    });
  }
  return {
    venueId: String(order.venueId),
    venueSlug: venue.slug,
    barId: String(order.barId),
    ...(zone ? { zoneId: String(zone._id) } : {}),
    lines,
    skipped,
  };
}
