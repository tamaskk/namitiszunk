import { InngestTestEngine } from "@inngest/test";
import * as jobs from "@namitiszunk/core/jobs";
import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deps } from "./deps";
import {
  expire,
  expireCancelOn,
  notify,
  paymentTimeout,
  pickupReminder,
  rejectRefund,
  stripeReconcile,
} from "./functions";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("./db", () => ({ connectJobsDb: vi.fn(async () => {}) }));
vi.mock("@namitiszunk/emails", () => ({ sendEmail: vi.fn() }));
vi.mock("@namitiszunk/core/jobs", () => ({
  cancelUnpaidOrder: vi.fn(async () => "cancelled"),
  expireOrder: vi.fn(async () => ({ expired: true, refund: false })),
  notifyByEmail: vi.fn(async () => "none"),
  notifyByPushOrSms: vi.fn(async () => "sms"),
  pickupDeadline: vi.fn(async () => new Date("2026-11-07T22:30:00Z")),
  reconcileStripe: vi.fn(async () => []),
  refundExpiredOrder: vi.fn(async () => "refunded"),
  sendPickupReminder: vi.fn(async () => "sms"),
}));

const orderId = "6730f0a1b2c3d4e5f6a7b8c9";
const readyEvent = {
  name: "order/status.changed",
  data: {
    orderId,
    venueId: "6730f0a1b2c3d4e5f6a7b8ca",
    event: "mark_ready",
    from: "preparing",
    to: "ready",
  },
} as const;

// The test engine stops at a sleep; a mocked sleep step simulates the time passing.
const slept = (...ids: string[]) =>
  ids.map((id) => ({ id, handler: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
});

function cancelEvents(fn: { opts: { cancelOn?: unknown[] } }) {
  return fn.opts.cancelOn?.map((c) => {
    const { event, if: when } = c as { event: { name: string }; if: string };
    return { event: event.name, if: when };
  });
}

describe("order/payment-timeout", () => {
  it("waits 15 minutes, then cancels the unpaid order and its PaymentIntent", async () => {
    const t = new InngestTestEngine({
      function: paymentTimeout,
      steps: slept("wait-for-payment"),
    });

    const { result, ctx } = await t.execute({
      events: [{ name: "order/created", data: { orderId, venueId: "v" } }],
    });

    expect(ctx.step.sleep).toHaveBeenCalledWith("wait-for-payment", "15m");
    expect(jobs.cancelUnpaidOrder).toHaveBeenCalledWith(
      orderId,
      deps.cancelPaymentIntent,
    );
    expect(result).toBe("cancelled");
  });

  it("stops waiting when the same order changes status (payment succeeded)", () => {
    expect(cancelEvents(paymentTimeout)).toEqual([
      {
        event: "order/status.changed",
        if: "async.data.orderId == event.data.orderId",
      },
    ]);
  });
});

describe("order/pickup-reminder", () => {
  it("only starts for orders that became Ready and is cancelled by the next change", () => {
    expect(pickupReminder.opts.triggers).toEqual([
      expect.objectContaining({ if: 'event.data.to == "ready"' }),
    ]);
    expect(cancelEvents(pickupReminder)).toEqual([
      {
        event: "order/status.changed",
        if: "async.data.orderId == event.data.orderId",
      },
    ]);
  });

  it("sends the reminder after 10 minutes", async () => {
    const t = new InngestTestEngine({
      function: pickupReminder,
      steps: slept("wait-for-pickup"),
    });

    const { result, ctx } = await t.execute({ events: [readyEvent] });

    expect(ctx.step.sleep).toHaveBeenCalledWith("wait-for-pickup", "10m");
    expect(jobs.sendPickupReminder).toHaveBeenCalledWith(orderId, deps.notify);
    expect(result).toBe("sms");
  });

  it("sends nothing when the order was picked up within 10 minutes", async () => {
    vi.mocked(jobs.sendPickupReminder).mockResolvedValueOnce("skipped");
    const t = new InngestTestEngine({
      function: pickupReminder,
      steps: slept("wait-for-pickup"),
    });

    const { result } = await t.execute({ events: [readyEvent] });

    expect(result).toBe("skipped");
  });
});

describe("order/expire", () => {
  it("is not cancelled by its own ready to expired event, only by other changes of the order", () => {
    const [cancel] = expireCancelOn;

    expect(cancel?.if).toBe(
      'async.data.orderId == event.data.orderId && async.data.event != "expire"',
    );
  });

  it("sleeps until the venue deadline, then expires the order", async () => {
    const t = new InngestTestEngine({
      function: expire,
      steps: slept("wait-for-deadline"),
    });

    const { result, ctx } = await t.execute({ events: [readyEvent] });

    expect(ctx.step.sleepUntil).toHaveBeenCalledWith(
      "wait-for-deadline",
      // The test engine skips the JSON round trip, so this is the Date; in Inngest it is its ISO string.
      new Date("2026-11-07T22:30:00Z"),
    );
    expect(jobs.expireOrder).toHaveBeenCalledWith(orderId);
    expect(jobs.refundExpiredOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ expired: true, refund: false });
  });

  it("refunds when the venue refunds expired orders", async () => {
    vi.mocked(jobs.expireOrder).mockResolvedValueOnce({
      expired: true,
      refund: true,
    });
    const t = new InngestTestEngine({
      function: expire,
      steps: slept("wait-for-deadline"),
    });

    await t.execute({ events: [readyEvent] });

    expect(jobs.refundExpiredOrder).toHaveBeenCalledWith(
      orderId,
      deps.refundPayment,
    );
  });

  it("refunds a rejected order in full", async () => {
    const refundRejected = vi
      .spyOn(deps, "refundRejected")
      .mockResolvedValueOnce(undefined);
    const t = new InngestTestEngine({ function: rejectRefund });

    const { result } = await t.execute({
      events: [
        {
          name: "order/status.changed",
          data: {
            ...readyEvent.data,
            event: "reject",
            from: "new",
            to: "rejected",
          },
        },
      ],
    });

    expect(refundRejected).toHaveBeenCalledWith(orderId);
    expect(result).toBe("refunded");
    expect(rejectRefund.opts.triggers).toEqual([
      expect.objectContaining({ if: 'event.data.event == "reject"' }),
    ]);
  });

  it("does not wait for an order no longer Ready", async () => {
    vi.mocked(jobs.pickupDeadline).mockResolvedValueOnce(null);
    const t = new InngestTestEngine({
      function: expire,
      steps: slept("wait-for-deadline"),
    });

    const { result, ctx } = await t.execute({ events: [readyEvent] });

    expect(ctx.step.sleepUntil).not.toHaveBeenCalled();
    expect(jobs.expireOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ expired: false });
  });
});

describe("order/notify", () => {
  it("runs push or SMS and e-mail as separate steps", async () => {
    const t = new InngestTestEngine({ function: notify });

    const { result } = await t.execute({ events: [readyEvent] });

    expect(jobs.notifyByPushOrSms).toHaveBeenCalledWith(
      orderId,
      "mark_ready",
      deps.notify,
    );
    expect(jobs.notifyByEmail).toHaveBeenCalledWith(
      orderId,
      "mark_ready",
      deps.notify,
    );
    expect(result).toEqual({ push: "sms", email: "none" });
  });
});

describe("stripe/reconcile", () => {
  it("runs daily at 07:30 Budapest time", () => {
    expect(stripeReconcile.opts.triggers).toEqual([
      { cron: "TZ=Europe/Budapest 30 7 * * *" },
    ]);
  });

  it("alerts Sentry when a Stripe charge has no order", async () => {
    const list = vi.fn(async () => [
      { paymentIntentId: "pi_deleted", amountHuf: 1990, refundedHuf: 0 },
    ]);
    deps.listStripeCharges = list;
    vi.mocked(jobs.reconcileStripe).mockImplementationOnce(
      async (range, listCharges) =>
        (await listCharges(range)).map((c) => ({
          paymentIntentId: c.paymentIntentId,
          problem: "missing_in_db" as const,
        })),
    );
    const t = new InngestTestEngine({ function: stripeReconcile });

    const { result } = await t.execute();

    expect(list).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Stripe reconciliation mismatch",
      expect.objectContaining({
        extra: {
          mismatches: [
            { paymentIntentId: "pi_deleted", problem: "missing_in_db" },
          ],
        },
      }),
    );
    expect(result).toEqual({ mismatches: 1 });
    deps.listStripeCharges = null;
  });

  it("stays quiet when Stripe and the database agree", async () => {
    deps.listStripeCharges = vi.fn(async () => []);
    const t = new InngestTestEngine({ function: stripeReconcile });

    await t.execute();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    deps.listStripeCharges = null;
  });
});
