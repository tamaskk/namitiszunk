import { deleteAccount } from "@namitiszunk/core/account";

import { accountCaller } from "@/lib/account-caller";
import { handler } from "@/lib/handler";

// The guest deletes their account (T-047); orders stay for the venue's books without it.
export const DELETE = handler(
  {
    auth: accountCaller,
    // The caller acts on their own account only; core refuses staff and platform users.
    permission: "none",
    rateLimit: { limit: 5, windowSeconds: 60 },
  },
  async ({ actor }) => deleteAccount(actor),
);
