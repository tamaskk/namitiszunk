"use server";

import { createPromo, setPromoActive } from "@namitiszunk/core/promos";
import {
  promoInputSchema,
  setPromoActiveInputSchema,
} from "@namitiszunk/validators";

import { runMenuAction as run } from "../menu/run-menu-action";

// Owner only: core checks venue.editSettings and writes the audit entry in the same transaction.
export async function createPromoAction(input: unknown) {
  return run(
    promoInputSchema,
    input,
    (data, c) => createPromo(c.actor, c.venueId, data).then(() => null),
    "/promos",
  );
}

export async function setPromoActiveAction(input: unknown) {
  return run(
    setPromoActiveInputSchema,
    input,
    ({ id, isActive }, c) =>
      setPromoActive(c.actor, c.venueId, id, isActive).then(() => null),
    "/promos",
  );
}
