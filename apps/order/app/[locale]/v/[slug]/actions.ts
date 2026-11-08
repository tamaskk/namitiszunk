"use server";

import { clientIp, hitRateLimit } from "@namitiszunk/core/api";
import { validateCart, type CartValidation } from "@namitiszunk/core/cart";
import { NotFoundError } from "@namitiszunk/core/errors";
import { validateCartInputSchema } from "@namitiszunk/validators";
import { headers } from "next/headers";

import { ensureDb } from "@/lib/db";

export type ValidateCartResult =
  | { data: CartValidation }
  | {
      error: {
        code:
          "validation_failed" | "not_found" | "rate_limited" | "client_unknown";
      };
    };

const RATE_LIMIT = { limit: 30, windowSeconds: 60 };

/** "Tovább" in the cart (T-041): re-checks the cart against the database before checkout. */
export async function validateCartAction(
  input: unknown,
): Promise<ValidateCartResult> {
  const parsed = validateCartInputSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "validation_failed" } };

  await ensureDb();
  // clientIp reads a Request; the action gets the same headers through next/headers.
  const ip = clientIp(
    new Request("http://action.local", { headers: await headers() }),
  );
  if (ip === null) return { error: { code: "client_unknown" } };
  if (await hitRateLimit(`action validateCart|ip:${ip}`, RATE_LIMIT)) {
    return { error: { code: "rate_limited" } };
  }

  try {
    return { data: await validateCart(parsed.data) };
  } catch (error) {
    if (error instanceof NotFoundError) return { error: { code: "not_found" } };
    throw error;
  }
}
