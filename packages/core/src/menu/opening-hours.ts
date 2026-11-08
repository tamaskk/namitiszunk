import { TZDate } from "@date-fns/tz";

import { reportError } from "../report-error";

/** The Venue model's default; a lean read of an older venue may not carry the field. */
export const DEFAULT_LAST_ORDER_MINUTES = 15;

/** One opening of the week: ISO day (1 Monday … 7 Sunday), local "HH:mm"; a close at or before the open is the next day. */
export type OpeningHours = { day: number; open: string; close: string };

export type OpeningState = {
  /** Inside opening hours and before the last order. */
  orderable: boolean;
  /** Last order of the current opening (close minus the venue's minutes); null when closed. */
  lastOrderAt: Date | null;
  /** Start of the next opening when not orderable; null when open or no hours within a week. */
  nextOpenAt: Date | null;
};

const minutesOf = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Openings from yesterday (one may run past midnight) to a week ahead, in the venue's zone. */
function openings(hours: readonly OpeningHours[], timezone: string, now: Date) {
  const today = new TZDate(now, timezone);
  const result: { start: Date; end: Date }[] = [];
  for (let offset = -1; offset <= 7; offset++) {
    const date = new TZDate(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
      timezone,
    );
    const isoDay = date.getDay() === 0 ? 7 : date.getDay();
    for (const entry of hours.filter((h) => h.day === isoDay)) {
      const open = minutesOf(entry.open);
      const close = minutesOf(entry.close);
      // Wall-clock times, so a DST night keeps "22:00–04:00" at 22:00 and 04:00 local.
      const at = (dayOffset: number, minutes: number) =>
        new TZDate(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + dayOffset,
          Math.floor(minutes / 60),
          minutes % 60,
          timezone,
        );
      result.push({
        start: at(0, open),
        end: at(close <= open ? 1 : 0, close),
      });
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Whether guests can order now by the venue's opening hours (T-048). No hours set means the bar's
 * open/closed switch alone decides, as before: always orderable here.
 */
export function openingState(
  hours: readonly OpeningHours[] | undefined,
  lastOrderMinutesBeforeClose: number | undefined,
  timezone: string,
  now: Date,
): OpeningState {
  if (!hours?.length)
    return { orderable: true, lastOrderAt: null, nextOpenAt: null };
  let all: { start: Date; end: Date }[];
  try {
    all = openings(hours, timezone, now);
    if (all.some((o) => Number.isNaN(o.start.getTime() + o.end.getTime())))
      throw new RangeError("invalid opening hours or time zone");
  } catch (error) {
    // Bad venue data must not turn the menu into a 500 for every guest: closed, and the team hears of it.
    reportError(error);
    return { orderable: false, lastOrderAt: null, nextOpenAt: null };
  }
  // Overlapping entries: the opening that runs longest decides tonight's last order.
  const current = all
    .filter((o) => o.start <= now && now < o.end)
    .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
  const minutes = lastOrderMinutesBeforeClose ?? DEFAULT_LAST_ORDER_MINUTES;
  const lastOrderAt = current
    ? new Date(current.end.getTime() - minutes * 60_000)
    : null;
  if (lastOrderAt && now < lastOrderAt)
    return { orderable: true, lastOrderAt, nextOpenAt: null };
  return {
    orderable: false,
    lastOrderAt: null,
    nextOpenAt: all.find((o) => o.start > now)?.start ?? null,
  };
}
