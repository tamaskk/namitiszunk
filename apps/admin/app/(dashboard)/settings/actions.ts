"use server";

import { updateVenueSettings } from "@namitiszunk/core/settings";
import { venueSettingsInputSchema } from "@namitiszunk/validators";

import { runMenuAction as run } from "../menu/run-menu-action";

/** Saves one Settings tab (T-058); core checks venue.editSettings and writes the audit. */
export async function saveSettingsAction(input: unknown) {
  return run(
    venueSettingsInputSchema,
    input,
    (data, c) => updateVenueSettings(c.actor, c.venueId, data),
    "/settings",
  );
}
