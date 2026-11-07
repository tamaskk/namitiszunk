import "server-only";

import type { NotifyDeps, StripeCharge } from "@namitiszunk/core/jobs";
import { listSucceededCharges } from "@namitiszunk/core/payments";
import { sendEmail } from "@namitiszunk/emails";
import { NonRetriableError } from "inngest";

/** Integrations other wave-2 tasks own; each shortcut says what replaces it. */
export const deps = {
  // shortcut: no PaymentIntent exists before T-033, so there is nothing to cancel; wire T-033's cancel (idempotent, tolerating an already-cancelled intent) once merged.
  cancelPaymentIntent: async (orderId: string): Promise<void> => {
    void orderId;
  },
  // shortcut: refunds land with T-034; until then an enabled refund-on-expiry fails loudly (Sentry) instead of marking an unpaid refund.
  refundPayment: async (orderId: string): Promise<void> => {
    throw new NonRetriableError(
      `refund on expiry for order ${orderId} needs T-034`,
    );
  },
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
