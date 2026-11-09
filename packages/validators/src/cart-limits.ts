// Zod-free, so the guest cart can import the limit without pulling zod into the menu bundle.
export const MAX_QUANTITY_PER_LINE = 10;

/** The checkout's tip presets in basis points (0, 5, 10, 15%); the guest may also type an amount. */
export const TIP_PERCENT_BPS = [0, 500, 1000, 1500] as const;

/** A Hungarian number as the API takes it (`huPhoneSchema`); here so the checkout form checks it without zod. */
export const HU_PHONE_PATTERN = /^\+36\d{8,9}$/;

/** The public site (apps/landing); the checkout links its terms at `${SITE_URL}/${locale}/aszf`. */
// shortcut: production only, so dev and preview checkouts link the live site; a NEXT_PUBLIC_SITE_URL once previews need their own terms.
export const SITE_URL = "https://namitiszunk.hu";
