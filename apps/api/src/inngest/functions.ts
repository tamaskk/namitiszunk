import "server-only";

import {
  cancelUnpaidOrder,
  expireOrder,
  notifyByEmail,
  notifyByPushOrSms,
  pickupDeadline,
  reconcileStripe,
  refundExpiredOrder,
  sendPickupReminder,
} from "@namitiszunk/core/jobs";
import { AppError } from "@namitiszunk/core/errors";
import { problemReportMails } from "@namitiszunk/core/orders";
import { runRetention } from "@namitiszunk/core/retention";
import * as Sentry from "@sentry/nextjs";
import { RetryAfterError } from "inngest";

import { connectJobsDb } from "./db";
import {
  inngest,
  orderCreated,
  orderStatusChanged,
  problemReported,
  reportFailure,
} from "./client";
import { deps } from "./deps";

const becameReady = 'event.data.to == "ready"';
// Any later change of the same order (pick-up, expiry) ends the wait.
const sameOrder = "async.data.orderId == event.data.orderId";
const leftReady = [{ event: orderStatusChanged, if: sameOrder }];
// The run's own ready→expired event must not cancel it before the refund step.
export const expireCancelOn = [
  {
    event: orderStatusChanged,
    if: `${sameOrder} && async.data.event != "expire"`,
  },
];

export const paymentTimeout = inngest.createFunction(
  {
    id: "order-payment-timeout",
    triggers: [orderCreated],
    // Payment success ends the wait early.
    cancelOn: [
      {
        event: orderStatusChanged,
        if: "async.data.orderId == event.data.orderId",
      },
    ],
    onFailure: reportFailure,
  },
  async ({ event, step }) => {
    await step.sleep("wait-for-payment", "15m");
    return step.run("cancel-unpaid", async () => {
      await connectJobsDb();
      return cancelUnpaidOrder(event.data.orderId, deps.cancelPaymentIntent);
    });
  },
);

export const pickupReminder = inngest.createFunction(
  {
    id: "order-pickup-reminder",
    triggers: [{ event: orderStatusChanged, if: becameReady }],
    cancelOn: leftReady,
    onFailure: reportFailure,
  },
  async ({ event, step }) => {
    await step.sleep("wait-for-pickup", "10m");
    return step.run("send-reminder", async () => {
      await connectJobsDb();
      return sendPickupReminder(event.data.orderId, deps.notify);
    });
  },
);

export const expire = inngest.createFunction(
  {
    id: "order-expire",
    triggers: [{ event: orderStatusChanged, if: becameReady }],
    cancelOn: expireCancelOn,
    onFailure: reportFailure,
  },
  async ({ event, step }) => {
    const { orderId } = event.data;
    const deadline = await step.run("read-deadline", async () => {
      await connectJobsDb();
      return pickupDeadline(orderId);
    });
    if (!deadline) return { expired: false };
    await step.sleepUntil("wait-for-deadline", deadline);
    const result = await step.run("expire", async () => {
      await connectJobsDb();
      return expireOrder(orderId);
    });
    if (!result.refund) return result;
    await step.run("refund", async () => {
      await connectJobsDb();
      return refundExpiredOrder(orderId, deps.refundPayment);
    });
    return result;
  },
);

// A rejection (staff, or the guest before acceptance) refunds the full amount and the platform fee.
export const rejectRefund = inngest.createFunction(
  {
    id: "order-reject-refund",
    triggers: [
      { event: orderStatusChanged, if: 'event.data.event == "reject"' },
    ],
    onFailure: reportFailure,
  },
  async ({ event, step }) =>
    step.run("refund", async () => {
      await connectJobsDb();
      try {
        await deps.refundRejected(event.data.orderId);
      } catch (error) {
        // Rejected before the payment webhook stored the Payment as paid: retry once it has.
        if (error instanceof AppError && error.code === "order_not_paid") {
          throw new RetryAfterError("payment not recorded yet", "30s", {
            cause: error,
          });
        }
        throw error;
      }
      return "refunded";
    }),
);

export const notify = inngest.createFunction(
  {
    id: "order-notify",
    triggers: [orderStatusChanged],
    onFailure: reportFailure,
  },
  async ({ event, step }) => {
    const { orderId, event: orderEvent } = event.data;
    // Separate steps, so a failed e-mail retries without sending the push or SMS again.
    const push = await step.run("push-or-sms", async () => {
      await connectJobsDb();
      return notifyByPushOrSms(orderId, orderEvent, deps.notify);
    });
    const email = await step.run("email", async () => {
      await connectJobsDb();
      return notifyByEmail(orderId, orderEvent, deps.notify);
    });
    return { push, email };
  },
);

export const stripeReconcile = inngest.createFunction(
  {
    id: "stripe-reconcile",
    triggers: [{ cron: "TZ=Europe/Budapest 30 7 * * *" }],
    onFailure: reportFailure,
  },
  async ({ step }) => {
    const list = deps.listStripeCharges;
    if (!list) return { skipped: "stripe client not wired (T-032)" };
    const mismatches = await step.run("compare", async () => {
      await connectJobsDb();
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      return reconcileStripe({ from, to }, list);
    });
    if (mismatches.length > 0) {
      // Ids and amounts only, no personal data.
      Sentry.captureMessage("Stripe reconciliation mismatch", {
        level: "error",
        tags: { inngest_function: "stripe-reconcile" },
        extra: { mismatches },
      });
    }
    return { mismatches: mismatches.length };
  },
);

export const retentionDaily = inngest.createFunction(
  {
    id: "retention-daily",
    triggers: [{ cron: "TZ=Europe/Budapest 0 5 * * *" }],
    onFailure: reportFailure,
  },
  async ({ step }) =>
    step.run("run-retention", async () => {
      await connectJobsDb();
      return runRetention({ now: new Date(), dryRun: false });
    }),
);

export const reportsWeekly = inngest.createFunction(
  {
    id: "reports-weekly",
    triggers: [{ cron: "TZ=Europe/Budapest 0 8 * * 1" }],
    onFailure: reportFailure,
  },
  // shortcut: the weekly report e-mail is T-062; register its sender here.
  async () => ({ skipped: "weekly report not built (T-062)" }),
);

// A guest's problem report (T-046) to the venue and the platform; one step per mail, so a retry never
// sends the first one twice.
export const problemReportEmail = inngest.createFunction(
  {
    id: "order-problem-report-email",
    triggers: [{ event: problemReported }],
    onFailure: reportFailure,
  },
  async ({ event, step }) => {
    const { orderId, index } = event.data;
    const mails = await step.run("load", async () => {
      await connectJobsDb();
      return problemReportMails(orderId, index, deps.problems.links);
    });
    for (const [i, mail] of mails.entries()) {
      await step.run(`send-${i}`, () => deps.problems.sendMail(mail));
    }
    return mails.length;
  },
);

export const functions = [
  problemReportEmail,
  paymentTimeout,
  pickupReminder,
  expire,
  rejectRefund,
  notify,
  stripeReconcile,
  retentionDaily,
  reportsWeekly,
];
