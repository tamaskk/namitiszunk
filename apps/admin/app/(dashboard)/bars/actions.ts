"use server";

import {
  createBar,
  createZone,
  updateBar,
  updateZone,
} from "@namitiszunk/core/bars";
import {
  barInputSchema,
  updateBarInputSchema,
  updateZoneInputSchema,
  zoneInputSchema,
} from "@namitiszunk/validators";

import { runMenuAction as run } from "../menu/run-menu-action";

export async function createBarAction(input: unknown) {
  return run(
    barInputSchema,
    input,
    (data, c) => createBar(c.actor, c.venueId, data).then(() => null),
    "/bars",
  );
}

export async function updateBarAction(input: unknown) {
  return run(
    updateBarInputSchema,
    input,
    ({ id, input }, c) =>
      updateBar(c.actor, c.venueId, id, input).then(() => null),
    "/bars",
  );
}

export async function createZoneAction(input: unknown) {
  return run(
    zoneInputSchema,
    input,
    (data, c) => createZone(c.actor, c.venueId, data).then(() => null),
    "/bars",
  );
}

export async function updateZoneAction(input: unknown) {
  return run(
    updateZoneInputSchema,
    input,
    ({ id, input }, c) =>
      updateZone(c.actor, c.venueId, id, input).then(() => null),
    "/bars",
  );
}
