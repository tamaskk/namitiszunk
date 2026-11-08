// Zod-free, so the guest cart can import the limit without pulling zod into the menu bundle.
export const MAX_QUANTITY_PER_LINE = 10;

/** The checkout's tip presets in basis points (0, 5, 10, 15%); the guest may also type an amount. */
export const TIP_PERCENT_BPS = [0, 500, 1000, 1500] as const;
