import "server-only";

import {
  type ConnectedPayoutAccount,
  fetchPayoutOverview,
} from "@namitiszunk/core/payments";
import { cacheLife, cacheTag } from "next/cache";

export const payoutsTag = (venueId: string) => `payouts:${venueId}`;

/**
 * Stripe's balance, payouts and disputes, kept 5 minutes per venue so page loads stay under
 * Stripe's rate limit; "Frissítés" drops it with updateTag. The page checks `payout.manage`
 * (getPayoutAccount) before calling this, so only an Owner ever reaches the cached data.
 */
export async function cachedPayoutOverview(
  venueId: string,
  account: ConnectedPayoutAccount,
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 300 });
  cacheTag(payoutsTag(venueId));
  return fetchPayoutOverview(account);
}
