const hufFormat = new Intl.NumberFormat("hu-HU", {
  style: "currency",
  currency: "HUF",
  maximumFractionDigits: 0,
  // hu-HU leaves four-digit numbers ungrouped ("1990 Ft"); prices read better as "1 990 Ft".
  useGrouping: "always",
});

/** The only way to show an amount: integer forints, hu-HU style, in every UI language. */
export function formatHuf(amountHuf: number): string {
  if (!Number.isSafeInteger(amountHuf)) {
    throw new RangeError(
      `Amount must be a whole number of forints, got ${amountHuf}`,
    );
  }
  return hufFormat.format(amountHuf);
}

/** Club times are Budapest times, whatever the device or server time zone is. */
export function formatDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Budapest",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
