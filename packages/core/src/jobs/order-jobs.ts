import "server-only";

import { Bar, Order, User, Venue, VenueMember } from "@namitiszunk/db";
import { defaultLocale, isLocale, type Locale } from "@namitiszunk/i18n";

import type { Actor } from "../auth/permissions";
import {
  readySmsText,
  reminderSmsText,
  sendSms,
  shouldSendSms,
} from "../notify/sms";
import { formatShortNumber } from "../orders/short-number";
import { InvalidTransition, type OrderEvent } from "../orders/state-machine";
import { transition } from "../orders/transition";

const inngest: Actor = { kind: "system", source: "inngest" };

export type PushKind =
  | "paid"
  | "preparing"
  | "ready"
  | "reminder"
  | "rejected"
  | "refunded"
  | "expired";

type OrderMailData = {
  locale: Locale;
  venueName: string;
  venueEmail: string;
  shortNumber: string;
};

/** Mirrors the order templates of @namitiszunk/emails, which core may not import (it renders React). */
export type OrderEmail =
  | {
      template: "orderConfirmation";
      to: string;
      data: OrderMailData & {
        items: { name: string; quantity: number; amountHuf: number }[];
        totalHuf: number;
      };
    }
  | {
      template: "orderRejected" | "orderRefunded";
      to: string;
      data: OrderMailData & { refundHuf: number };
    };

export type NotifyDeps = {
  /** True when the guest got it as a push; false falls back to SMS. */
  sendPush: (input: {
    orderId: string;
    userId?: string;
    kind: PushKind;
  }) => Promise<boolean>;
  sendEmail: (email: OrderEmail) => Promise<unknown>;
  links: { order: (orderId: string) => string; smsStatusCallback: string };
};

/** Runs one system transition; "skipped" when the order already left the source status. */
async function transitionOnce(
  orderId: string,
  event: OrderEvent,
): Promise<"done" | "skipped"> {
  try {
    await transition(orderId, event, inngest);
    return "done";
  } catch (error) {
    if (error instanceof InvalidTransition) return "skipped";
    throw error;
  }
}

/**
 * 15 minutes after creation: cancels the PaymentIntent, then the order.
 * Cancelling first matters: if Stripe already captured, it throws and the retry finds the paid order and skips.
 */
export async function cancelUnpaidOrder(
  orderId: string,
  cancelPaymentIntent: (orderId: string) => Promise<void>,
): Promise<"cancelled" | "skipped"> {
  const order = await Order.findById(orderId).select("status").lean();
  if (order?.status !== "awaiting_payment") return "skipped";
  await cancelPaymentIntent(orderId);
  return (await transitionOnce(orderId, "payment_timeout")) === "done"
    ? "cancelled"
    : "skipped";
}

/** When a Ready order expires: readyAt + the venue's pickup deadline (15-60 minutes); null when no longer Ready. */
export async function pickupDeadline(orderId: string): Promise<Date | null> {
  const order = await Order.findById(orderId)
    .select("status venueId readyAt")
    .lean();
  if (order?.status !== "ready" || !order.readyAt) return null;
  const venue = await Venue.findById(order.venueId)
    .select("orderRules.pickupDeadlineMinutes")
    .lean();
  const minutes = venue?.orderRules?.pickupDeadlineMinutes ?? 30;
  return new Date(order.readyAt.getTime() + minutes * 60_000);
}

/** At the venue's pickup deadline: Ready becomes Expired. `refund` says whether the venue refunds expired orders. */
export async function expireOrder(
  orderId: string,
): Promise<{ expired: boolean; refund: boolean }> {
  await transitionOnce(orderId, "expire");
  // Read back instead of trusting the transition result, so a retry after a failed hook still continues.
  const order = await Order.findById(orderId).select("status venueId").lean();
  if (order?.status !== "expired") return { expired: false, refund: false };
  const venue = await Venue.findById(order.venueId)
    .select("orderRules.refundOnExpiry")
    .lean();
  return {
    expired: true,
    refund: venue?.orderRules?.refundOnExpiry ?? false,
  };
}

/** `refundPayment` must be idempotent per order (T-034): a retry after a failed transition calls it again. */
export async function refundExpiredOrder(
  orderId: string,
  refundPayment: (orderId: string) => Promise<void>,
): Promise<"refunded" | "skipped"> {
  const order = await Order.findById(orderId).select("status").lean();
  if (order?.status !== "expired") return "skipped";
  await refundPayment(orderId);
  return (await transitionOnce(orderId, "refund")) === "done"
    ? "refunded"
    : "skipped";
}

async function loadOrder(orderId: string) {
  const order = await Order.findById(orderId)
    .select(
      "status venueId barId userId guestPhone smsRequested shortNumber items totalHuf",
    )
    .lean();
  if (!order) throw new Error(`order ${orderId} not found`);
  const user = order.userId
    ? await User.findById(order.userId).select("email locale").lean()
    : null;
  const locale: Locale = isLocale(user?.locale) ? user.locale : defaultLocale;
  return { order, user, locale };
}

type Loaded = Awaited<ReturnType<typeof loadOrder>>;

async function pushOrSms(
  { order, locale }: Loaded,
  kind: "ready" | "reminder",
  deps: NotifyDeps,
): Promise<"push" | "sms" | "none"> {
  const orderId = String(order._id);
  const userId = order.userId ? String(order.userId) : undefined;
  if (await deps.sendPush({ orderId, userId, kind })) return "push";

  const venue = await Venue.findById(order.venueId)
    .select("orderRules.smsEnabled")
    .lean();
  const allowed = shouldSendSms({
    hasPushToken: false,
    smsRequested: order.smsRequested ?? false,
    venueSmsEnabled: venue?.orderRules?.smsEnabled ?? false,
    // shortcut: no per-order SMS counter yet; at most one ready and one reminder SMS by construction (event ids dedupe, steps memoize), add an Order field with T-043.
    smsCountForOrder: kind === "ready" ? 0 : 1,
  });
  if (!allowed || !order.guestPhone) return "none";

  const bar = await Bar.findById(order.barId).select("name").lean();
  const barName = bar?.name ?? "";
  const text =
    kind === "ready"
      ? readySmsText(locale, {
          shortNumber: order.shortNumber,
          barName,
          link: deps.links.order(orderId),
        })
      : reminderSmsText(locale, { barName });
  await sendSms(order.guestPhone, text, deps.links.smsStatusCallback);
  return "sms";
}

/** 10 minutes after Ready: a push, or an SMS when there is no push and the guest asked for one. */
export async function sendPickupReminder(
  orderId: string,
  deps: NotifyDeps,
): Promise<"push" | "sms" | "none" | "skipped"> {
  const loaded = await loadOrder(orderId);
  if (loaded.order.status !== "ready") return "skipped";
  return pushOrSms(loaded, "reminder", deps);
}

const pushKindByEvent: Partial<Record<OrderEvent, PushKind>> = {
  payment_succeeded: "paid",
  start_preparing: "preparing",
  mark_ready: "ready",
  reject: "rejected",
  refund: "refunded",
  expire: "expired",
};

/** Notification order (docs/fejlesztesi-terv.md #90): push when the app can, else the live page and SMS for Ready. */
export async function notifyByPushOrSms(
  orderId: string,
  event: OrderEvent,
  deps: NotifyDeps,
): Promise<"push" | "sms" | "none"> {
  const kind = pushKindByEvent[event];
  if (!kind) return "none";
  const loaded = await loadOrder(orderId);
  if (kind === "ready") return pushOrSms(loaded, "ready", deps);
  const userId = loaded.order.userId ? String(loaded.order.userId) : undefined;
  return (await deps.sendPush({ orderId, userId, kind })) ? "push" : "none";
}

/** Confirmation, rejection and refund mails; only to a guest with an address on file. */
export async function notifyByEmail(
  orderId: string,
  event: OrderEvent,
  deps: NotifyDeps,
): Promise<"sent" | "none"> {
  if (event !== "payment_succeeded" && event !== "reject" && event !== "refund")
    return "none";
  const { order, user, locale } = await loadOrder(orderId);
  // shortcut: only a signed-in guest's User.email; a checkout-typed address needs an Order field (T-040/T-044).
  if (!user?.email) return "none";

  const [venue, owner] = await Promise.all([
    Venue.findById(order.venueId).select("name").lean(),
    VenueMember.findOne({
      venueId: order.venueId,
      role: "owner",
      userId: { $exists: true },
    })
      .select("userId")
      .lean(),
  ]);
  // shortcut: the venue has no contact e-mail field, so replies go to the owner's account address.
  const ownerUser = owner?.userId
    ? await User.findById(owner.userId).select("email").lean()
    : null;
  if (!venue || !ownerUser?.email)
    throw new Error(`venue ${String(order.venueId)} has no owner e-mail`);

  const base = {
    locale,
    venueName: venue.name,
    venueEmail: ownerUser.email,
    shortNumber: formatShortNumber(order.shortNumber),
  };
  // Rejected and refunded orders are refunded in full (partial refunds keep the status).
  await deps.sendEmail(
    event === "payment_succeeded"
      ? {
          template: "orderConfirmation",
          to: user.email,
          data: {
            ...base,
            items: order.items.map((item) => ({
              name: locale === "en" ? (item.nameEn ?? item.name) : item.name,
              quantity: item.quantity,
              amountHuf: item.lineTotalHuf,
            })),
            totalHuf: order.totalHuf,
          },
        }
      : {
          template: event === "reject" ? "orderRejected" : "orderRefunded",
          to: user.email,
          data: { ...base, refundHuf: order.totalHuf },
        },
  );
  return "sent";
}
