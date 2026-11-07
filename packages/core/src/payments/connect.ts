import "server-only";

import {
  type ClientSession,
  StripeEvent,
  Venue,
  type VenueDoc,
} from "@namitiszunk/db";
import Stripe from "stripe";

import { audit, type AuditEntry, auditActorOf } from "../audit/audit";
import { type Actor, requirePermission } from "../auth/permissions";
import { AppError, ConflictError, NotFoundError } from "../errors";
import { reportError } from "../report-error";
import { handlePaymentFailed, handlePaymentSucceeded } from "./payment-intents";
import { stripe } from "./stripe-client";

/** The guest ordering site; Apple Pay and Google Pay need it registered on every connected account. */
export const ORDER_DOMAIN = "rendel.namitiszunk.hu";

export type PayoutInterval = "daily" | "weekly";

const systemStripe: Actor = { kind: "system", source: "stripe" };

async function inTransaction(
  work: (session: ClientSession) => Promise<void>,
): Promise<void> {
  const session = await Venue.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

/** Owner-only (`payout.manage`); returns the venue's connected account id or throws. */
async function ownedAccountId(venueId: string, actor: Actor): Promise<string> {
  requirePermission(actor, "payout.manage", { venueId });
  const venue = await Venue.findById(venueId).select("stripeAccountId").lean();
  if (!venue) throw new NotFoundError();
  if (!venue.stripeAccountId) throw new ConflictError("stripe_account_missing");
  return venue.stripeAccountId;
}

/** Creates the venue's Express account once; a repeat returns the existing id. */
export async function createConnectAccount(
  venueId: string,
  actor: Actor,
): Promise<{ stripeAccountId: string }> {
  requirePermission(actor, "payout.manage", { venueId });
  const venue = await Venue.findById(venueId)
    .select("name stripeAccountId")
    .lean();
  if (!venue) throw new NotFoundError();
  if (venue.stripeAccountId) return { stripeAccountId: venue.stripeAccountId };

  // The idempotency key makes two concurrent clicks create one account, not two.
  const account = await stripe().accounts.create(
    {
      type: "express",
      country: "HU",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: { name: venue.name },
      metadata: { venueId },
    },
    { idempotencyKey: `connect-account-${venueId}` },
  );

  await inTransaction(async (session) => {
    const updated = await Venue.updateOne(
      { _id: venueId, stripeAccountId: { $in: [null, account.id] } },
      { $set: { stripeAccountId: account.id } },
      { session },
    );
    if (updated.matchedCount === 0) throw new ConflictError();
    if (updated.modifiedCount === 0) return;
    await audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "venue.stripe_account_created",
      target: { type: "venue", id: venueId },
      after: { stripeAccountId: account.id },
    });
  });
  return { stripeAccountId: account.id };
}

/**
 * An onboarding link; `adminBaseUrl` is the Admin origin (e.g. https://admin.namitiszunk.hu),
 * so Stripe sends the Owner back to the Payouts page (T-059).
 */
export async function createAccountLink(
  venueId: string,
  actor: Actor,
  adminBaseUrl: string,
): Promise<{ url: string; expiresAt: string }> {
  const accountId = await ownedAccountId(venueId, actor);
  const payouts = new URL("/payouts", adminBaseUrl);
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${payouts.href}?stripe=refresh`,
    return_url: `${payouts.href}?stripe=return`,
    collection_options: { fields: "currently_due" },
  });
  return {
    url: link.url,
    expiresAt: new Date(link.expires_at * 1000).toISOString(),
  };
}

/** Writes the Owner's payout frequency to the account's `settings.payouts.schedule`. */
export async function setPayoutSchedule(
  venueId: string,
  actor: Actor,
  interval: PayoutInterval,
): Promise<void> {
  const accountId = await ownedAccountId(venueId, actor);
  const schedule =
    interval === "weekly"
      ? { interval: "weekly" as const, weekly_anchor: "monday" as const }
      : { interval: "daily" as const };
  await stripe().accounts.update(accountId, {
    settings: { payouts: { schedule } },
  });
  await inTransaction((session) =>
    audit(session, {
      actor: auditActorOf(actor),
      venueId,
      action: "venue.payout_schedule_set",
      target: { type: "venue", id: venueId },
      after: { interval },
    }),
  );
}

/** A single-use Express Dashboard sign-in link for the Owner. */
export async function createDashboardLoginLink(
  venueId: string,
  actor: Actor,
): Promise<{ url: string }> {
  const accountId = await ownedAccountId(venueId, actor);
  const link = await stripe().accounts.createLoginLink(accountId);
  return { url: link.url };
}

/** Verifies the Stripe-Signature on the raw body and parses it; throws 400 on any mismatch. */
export function constructStripeEvent(
  rawBody: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new AppError(400, "invalid_signature");
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new AppError(400, "invalid_signature");
  }
}

/** Claims the event id inside the caller's transaction; false means it was already processed. */
export async function claimStripeEvent(
  session: ClientSession,
  event: Pick<Stripe.Event, "id" | "type">,
): Promise<boolean> {
  if (await StripeEvent.exists({ eventId: event.id }).session(session)) {
    return false;
  }
  await StripeEvent.create([{ eventId: event.id, type: event.type }], {
    session,
  });
  return true;
}

/** Registers the order domain on the connected account unless it already is (list first: create is not idempotent). */
async function ensureOrderDomain(accountId: string): Promise<void> {
  const options = { stripeAccount: accountId };
  const existing = await stripe().paymentMethodDomains.list(
    { domain_name: ORDER_DOMAIN, limit: 1 },
    options,
  );
  if (existing.data.length > 0) return;
  await stripe().paymentMethodDomains.create(
    { domain_name: ORDER_DOMAIN, enabled: true },
    options,
  );
}

/**
 * account.updated from the Connect webhook: mirrors charges, payouts and missing requirements
 * onto the Venue, and makes sure the order domain is registered while charges are enabled.
 */
export async function handleAccountUpdated(
  event: Stripe.AccountUpdatedEvent,
): Promise<void> {
  // shortcut: trusts the event payload, so an out-of-order older event can briefly overwrite newer flags; retrieve the account instead if that shows up.
  const account = event.data.object;
  const after = {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    stripeRequirementsDue: account.requirements?.currently_due ?? [],
  };

  let updated = false;
  await inTransaction(async (session) => {
    updated = false;
    if (!(await claimStripeEvent(session, event))) return;
    const venue = await Venue.findOne({ stripeAccountId: account.id })
      .select("chargesEnabled payoutsEnabled stripeRequirementsDue")
      .session(session)
      .lean();
    // An account we do not know (another environment, a deleted venue): only the event id is kept.
    if (!venue) return;

    await Venue.updateOne({ _id: venue._id }, { $set: after }, { session });
    const entry: AuditEntry = {
      actor: auditActorOf(systemStripe),
      venueId: venue._id,
      action: "venue.stripe_account_updated",
      target: { type: "venue", id: venue._id },
      before: {
        chargesEnabled: venue.chargesEnabled,
        payoutsEnabled: venue.payoutsEnabled,
        stripeRequirementsDue: venue.stripeRequirementsDue ?? [],
      },
      after,
    };
    await audit(session, entry);
    updated = true;
  });
  // After the commit: a Stripe outage must not undo the flags. The next account.updated checks again.
  if (updated && after.chargesEnabled) {
    await ensureOrderDomain(account.id).catch(reportError);
  }
}

/**
 * The Connect webhook (apps/api/app/webhooks/stripe): verifies first, then dispatches.
 * Event types without a handler are acknowledged and not stored.
 */
export async function processConnectWebhook(
  rawBody: string,
  signature: string | null,
): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  const event = constructStripeEvent(rawBody, signature, secret);
  // A test-mode event never changes production data, nor a live one a preview or local database.
  if (event.livemode !== (process.env.VERCEL_ENV === "production")) return;
  if (event.type === "account.updated") await handleAccountUpdated(event);
  if (event.type === "payment_intent.succeeded") {
    await handlePaymentSucceeded(event);
  }
  if (event.type === "payment_intent.payment_failed") {
    await handlePaymentFailed(event);
  }
}

/** Order creation (T-033) calls this: only a venue whose connected account can charge takes orders. */
export function assertVenueCanCharge(
  venue: Pick<VenueDoc, "stripeAccountId" | "chargesEnabled">,
): void {
  if (!venue.stripeAccountId || venue.chargesEnabled !== true) {
    throw new ConflictError("payments_not_enabled");
  }
}
