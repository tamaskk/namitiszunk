import type { CSSProperties } from "react";

/**
 * The venue's accent (T-058) over the default --color-primary for everything inside. Core passes
 * only a colour with 4.5:1 on the dark background; null keeps the default.
 */
export function venueAccentStyle(
  accent: string | null,
): CSSProperties | undefined {
  if (!accent) return undefined;
  return {
    "--color-primary": accent,
    // DESIGN_SYSTEM: hover is the accent darkened by about 12%.
    "--color-primary-hover": `color-mix(in oklab, ${accent} 88%, black)`,
  } as CSSProperties;
}
