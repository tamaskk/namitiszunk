import { TZDate } from "@date-fns/tz";

export type BusinessDayVenue = {
  /** IANA zone, e.g. "Europe/Budapest". */
  timezone: string;
  /** Local "HH:mm" at which a new business day begins. */
  businessDayStart: string;
};

/**
 * The venue's business date ("YYYY-MM-DD") for an instant: the night after midnight still
 * belongs to the evening before, until `businessDayStart` local time.
 */
export function businessDate(now: Date, venue: BusinessDayVenue): string {
  const local = new TZDate(now, venue.timezone);
  const [startHours = 0, startMinutes = 0] = venue.businessDayStart
    .split(":")
    .map(Number);
  // Compare local wall-clock times, not elapsed hours, so DST nights keep the boundary.
  const beforeStart =
    local.getHours() * 60 + local.getMinutes() < startHours * 60 + startMinutes;
  const day = new Date(
    Date.UTC(
      local.getFullYear(),
      local.getMonth(),
      local.getDate() - (beforeStart ? 1 : 0),
    ),
  );
  return day.toISOString().slice(0, 10);
}
