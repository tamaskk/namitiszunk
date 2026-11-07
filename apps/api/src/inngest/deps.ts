import "server-only";

import type { NotifyDeps, StripeCharge } from "@namitiszunk/core/jobs";
import {
  cancelOrderPaymentIntents,
  listSucceededCharges,
  refundOrderInFull,
} from "@namitiszunk/core/payments";
import { sendEmail } from "@namitiszunk/emails";

/** Integrations other wave-2 tasks own; each shortcut says what replaces it. */
export const deps = {
  // Throws when Stripe already captured, so the job keeps the order for the webhook.
  cancelPaymentIntent: cancelOrderPaymentIntents,
  // Both refund whatever is left, idempotent per order, so a retried step never refunds twice (T-034).
  refundPayment: (orderId: string) => refundOrderInFull(orderId, "expired"),
  refundRejected: (orderId: string) => refundOrderInFull(orderId, "rejected"),
  // Nullable so tests can switch reconciliation off.
  listStripeCharges: listSucceededCharges as
    ((range: { from: Date; to: Date }) => Promise<StripeCharge[]>) | null,
  notify: {
    // shortcut: no push service before T-090 (Expo Push), so every guest falls back to the live page and SMS.
    sendPush: async () => false,
    sendEmail: (email) => sendEmail(email.template, email.to, email.data),
    links: {
      // shortcut: the guest token is stored hashed only, so the link opens the order without it; T-043 decides the SMS link.
      order: (orderId) => `https://rendel.namitiszunk.hu/o/${orderId}`,
      // The Twilio status callback route arrives with T-036's delivery tracking.
      smsStatusCallback: "https://api.namitiszunk.hu/webhooks/twilio",
    },
  } satisfies NotifyDeps,
};
