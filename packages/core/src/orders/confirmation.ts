import "server-only";

import {
  Order,
  type OrderDoc,
  Payment,
  type PaymentDoc,
  Refund,
  Venue,
  type VenueDoc,
} from "@namitiszunk/db";
import { isLocale, type Locale } from "@namitiszunk/i18n";

import type { Actor } from "../auth/permissions";
import { AppError, NotFoundError } from "../errors";
import type { OrderEmail } from "../jobs/order-jobs";
import { formatShortNumber, requireShortNumber } from "./short-number";

type GuestActor = Extract<Actor, { kind: "guest" }>;

/** At most this many guest-requested confirmation e-mails per order (T-044). */
export const CONFIRMATION_EMAIL_LIMIT = 3;

/**
 * The guest's payment confirmation (T-044). Not a receipt: the venue's till issues that, so there is
 * deliberately no VAT breakdown. Every field the accountant may ask to change is assembled here.
 */
export type Confirmation = {
  number: string;
  createdAt: Date;
  items: {
    name: string;
    nameEn?: string;
    options: string[];
    quantity: number;
    unitPriceHuf: number;
    lineTotalHuf: number;
  }[];
  subtotalHuf: number;
  discountHuf: number;
  serviceFeeHuf: number;
  tipHuf: number;
  totalHuf: number;
  paidAt: Date;
  /** Wallet ("apple_pay", "google_pay") or card brand; null when Stripe did not tell us. */
  method: { wallet?: string; brand?: string; last4?: string } | null;
  venue: {
    name: string;
    companyName?: string;
    taxNumber?: string;
    address?: string;
  };
  refunds: { amountHuf: number; at: Date }[];
};

type ConfirmationSource = {
  order: Pick<
    OrderDoc,
    | "shortNumber"
    | "createdAt"
    | "items"
    | "subtotalHuf"
    | "discountHuf"
    | "serviceFeeHuf"
    | "tipHuf"
    | "totalHuf"
  > & { paidAt: Date };
  payment: Pick<PaymentDoc, "cardBrand" | "cardLast4" | "wallet"> | null;
  venue: Pick<VenueDoc, "name" | "company" | "address">;
  refunds: { amountHuf: number; updatedAt: Date }[];
};

export function buildConfirmation({
  order,
  payment,
  venue,
  refunds,
}: ConfirmationSource): Confirmation {
  const a = venue.address;
  const address = [a?.postalCode, a?.city, a?.street].filter(Boolean).join(" ");
  const method =
    payment && (payment.wallet || payment.cardBrand)
      ? {
          ...(payment.wallet ? { wallet: payment.wallet } : {}),
          ...(payment.cardBrand ? { brand: payment.cardBrand } : {}),
          ...(payment.cardLast4 ? { last4: payment.cardLast4 } : {}),
        }
      : null;
  return {
    number: formatShortNumber(requireShortNumber(order.shortNumber)),
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      name: item.name,
      ...(item.nameEn ? { nameEn: item.nameEn } : {}),
      options: item.options.map((o) => o.name),
      quantity: item.quantity,
      unitPriceHuf: item.unitPriceHuf,
      lineTotalHuf: item.lineTotalHuf,
    })),
    subtotalHuf: order.subtotalHuf,
    discountHuf: order.discountHuf,
    serviceFeeHuf: order.serviceFeeHuf,
    tipHuf: order.tipHuf,
    totalHuf: order.totalHuf,
    paidAt: order.paidAt,
    method,
    venue: {
      name: venue.name,
      ...(venue.company?.name ? { companyName: venue.company.name } : {}),
      ...(venue.company?.taxNumber
        ? { taxNumber: venue.company.taxNumber }
        : {}),
      ...(address ? { address } : {}),
    },
    refunds: refunds.map((r) => ({ amountHuf: r.amountHuf, at: r.updatedAt })),
  };
}

/** The guest's own paid order; anything else (not theirs, never paid) is 404. */
async function loadPaidOrder(actor: GuestActor, orderId: string) {
  const order = await Order.findById(orderId)
    .select(
      "venueId shortNumber createdAt items subtotalHuf discountHuf serviceFeeHuf tipHuf totalHuf paidAt +guestTokenHash",
    )
    .lean();
  if (
    !order ||
    actor.guestId === "" ||
    order.guestTokenHash !== actor.guestId ||
    !order.paidAt
  )
    throw new NotFoundError();
  return { ...order, paidAt: order.paidAt };
}

export async function getGuestConfirmation(
  actor: GuestActor,
  orderId: string,
): Promise<Confirmation> {
  const order = await loadPaidOrder(actor, orderId);
  const [payment, venue, refunds] = await Promise.all([
    Payment.findOne({ orderId: order._id, status: { $ne: "requires_payment" } })
      .select("cardBrand cardLast4 wallet")
      .lean(),
    Venue.findById(order.venueId).select("name company address").lean(),
    Refund.find({ orderId: order._id, status: "succeeded" })
      .select("amountHuf updatedAt")
      .sort({ updatedAt: 1 })
      .lean(),
  ]);
  if (!venue) throw new Error(`venue ${String(order.venueId)} not found`);
  return buildConfirmation({ order, payment, venue, refunds });
}

/**
 * Sends the confirmation to an address the guest types (T-044), at most CONFIRMATION_EMAIL_LIMIT per
 * order. The count is taken atomically before sending and given back if the send fails.
 */
export async function requestConfirmationEmail(
  actor: GuestActor,
  orderId: string,
  input: { email: string; locale: string; url: string },
  sendEmail: (email: OrderEmail) => Promise<unknown>,
): Promise<void> {
  const order = await loadPaidOrder(actor, orderId);
  // Loaded before counting, so a failed lookup never uses up one of the guest's sends.
  const venue = await Venue.findById(order.venueId)
    .select("name contactEmail")
    .lean();
  const counted = await Order.updateOne(
    {
      _id: order._id,
      confirmationEmailCount: { $lt: CONFIRMATION_EMAIL_LIMIT },
    },
    { $inc: { confirmationEmailCount: 1 } },
  );
  if (counted.modifiedCount === 0)
    throw new AppError(429, "confirmation_email_limit");

  const locale: Locale = isLocale(input.locale) ? input.locale : "hu";
  try {
    await sendEmail({
      template: "orderConfirmation",
      to: input.email,
      data: {
        locale,
        venueName: venue?.name ?? "",
        venueEmail: venue?.contactEmail ?? "",
        shortNumber: formatShortNumber(requireShortNumber(order.shortNumber)),
        items: order.items.map((item) => ({
          name: locale === "en" ? (item.nameEn ?? item.name) : item.name,
          quantity: item.quantity,
          amountHuf: item.lineTotalHuf,
        })),
        totalHuf: order.totalHuf,
        confirmationUrl: input.url,
      },
    });
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, confirmationEmailCount: { $gt: 0 } },
      { $inc: { confirmationEmailCount: -1 } },
    );
    throw error;
  }
}
