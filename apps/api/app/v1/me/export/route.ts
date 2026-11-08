import { exportAccountData } from "@namitiszunk/core/account";

import { accountCaller } from "@/lib/account-caller";
import { handler } from "@/lib/handler";

// GDPR access (T-047): everything personal tied to the account, as JSON.
export const GET = handler(
  {
    auth: accountCaller,
    // The caller exports their own data only.
    permission: "none",
    rateLimit: { limit: 5, windowSeconds: 60 },
  },
  async ({ actor }) => exportAccountData(actor),
);
