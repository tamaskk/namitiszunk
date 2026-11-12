// What the Admin forms type, as the numbers the API takes; the schemas then refuse a NaN on the field.

/** "12" → 12; "" or junk → NaN. */
export const toInt = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value);

/** A percentage as typed ("12,5") in basis points (1250); more than 2 decimals or junk → NaN. */
export const percentToBps = (value: string) => {
  const typed = value.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(typed)
    ? Math.round(Number(typed) * 100)
    : Number.NaN;
};

/** 1250 → "12.5", as the form shows it again. */
export const bpsToPercent = (bps: number) => String(bps / 100);
