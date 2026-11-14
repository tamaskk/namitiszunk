import { z } from "zod";

import { ORDERS_EXPORT_MAX_DAYS } from "./admin-orders";

const day = z.iso.date();

// Whole days from `from` to `to`, both included: at least one, at most an export's 92.
const fits = (from: string, to: string) => {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days >= 1 && days <= ORDERS_EXPORT_MAX_DAYS;
};

/** The daily report (T-061): one business day, the current one when unset. */
export const reportDayQuerySchema = z.object({ date: day.optional() });

/** The period and bartender reports (T-061): business days from–to, and an optional second period to compare. */
export const reportRangeQuerySchema = z
  .object({
    from: day,
    to: day,
    cfrom: day.optional(),
    cto: day.optional(),
  })
  .refine(({ from, to }) => fits(from, to), {
    path: ["to"],
    error: "validation.exportRange",
  })
  .refine(
    ({ cfrom, cto }) =>
      (cfrom === undefined && cto === undefined) ||
      (cfrom !== undefined && cto !== undefined && fits(cfrom, cto)),
    { path: ["cto"], error: "validation.exportRange" },
  );

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
