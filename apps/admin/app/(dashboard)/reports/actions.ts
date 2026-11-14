"use server";

import { setWeeklyReport } from "@namitiszunk/core/reports";
import { setWeeklyReportInputSchema } from "@namitiszunk/validators";

import { runMenuAction as run } from "../menu/run-menu-action";

// The actor's own membership only: core refuses anyone else (403).
export async function setWeeklyReportAction(input: unknown) {
  return run(
    setWeeklyReportInputSchema,
    input,
    ({ on }, c) => setWeeklyReport(c.actor, c.venueId, on).then(() => null),
    "/reports",
  );
}
