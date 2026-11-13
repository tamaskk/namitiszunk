"use server";

import { hitRateLimit } from "@namitiszunk/core/api";
import { requirePermission } from "@namitiszunk/core/auth";
import { AppError } from "@namitiszunk/core/errors";
import {
  createAccountLink,
  createConnectAccount,
  createDashboardLoginLink,
  setPayoutSchedule,
} from "@namitiszunk/core/payments";
import { payoutScheduleInputSchema } from "@namitiszunk/validators";
import { updateTag } from "next/cache";

import { runMenuAction as run } from "../menu/run-menu-action";
import { payoutsTag } from "./overview";

const none = { safeParse: () => ({ success: true as const, data: null }) };

// Stripe returns the Owner to this Admin's own Payouts page; from server config, never the caller.
const adminBaseUrl = () =>
  process.env.BETTER_AUTH_URL || "https://admin.namitiszunk.hu";

/** Creates the Express account once, then an onboarding link (also for requirements still due). */
export async function startOnboardingAction() {
  return run(
    none,
    null,
    async (_, c) => {
      await createConnectAccount(c.venueId, c.actor);
      return createAccountLink(c.venueId, c.actor, adminBaseUrl());
    },
    "/payouts",
  );
}

export async function dashboardLinkAction() {
  return run(
    none,
    null,
    (_, c) => createDashboardLoginLink(c.venueId, c.actor),
    "/payouts",
  );
}

export async function setPayoutScheduleAction(input: unknown) {
  return run(
    payoutScheduleInputSchema,
    input,
    async (data, c) => {
      await setPayoutSchedule(c.venueId, c.actor, data.interval);
      updateTag(payoutsTag(c.venueId));
      return null;
    },
    "/payouts",
  );
}

/** "Frissítés": the next load reads Stripe again instead of the 5-minute copy. */
export async function refreshPayoutsAction() {
  return run(
    none,
    null,
    async (_, c) => {
      // The permission check before dropping the cache: a Manager cannot make the Owner's page hit Stripe.
      requirePermission(c.actor, "payout.manage", { venueId: c.venueId });
      // Each refresh costs 4 Stripe reads on the platform's quota.
      if (
        await hitRateLimit(`payouts-refresh:${c.venueId}`, {
          limit: 6,
          windowSeconds: 60,
        })
      )
        throw new AppError(429, "rate_limited");
      updateTag(payoutsTag(c.venueId));
      return null;
    },
    "/payouts",
  );
}
