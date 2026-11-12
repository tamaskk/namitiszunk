// WCAG 2.x contrast (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio). No "server-only": pure math.

/** --color-surface (DESIGN_SYSTEM): the lighter of the two dark backgrounds, so passing it passes --color-bg too. */
const DARK_SURFACE = "#151518";
/** DESIGN_SYSTEM §02 and T-049: the accent must reach 4.5:1 on the dark background. */
export const MIN_ACCENT_CONTRAST = 4.5;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** The contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** A venue accent the guest pages may use: readable on the dark background (and dark text on it). */
export function accentIsReadable(hex: string): boolean {
  return (
    /^#[0-9a-fA-F]{6}$/.test(hex) &&
    contrastRatio(hex, DARK_SURFACE) >= MIN_ACCENT_CONTRAST
  );
}
