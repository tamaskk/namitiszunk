import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import tokens from "../../tokens.json";

// Without the token names, tailwind-merge reads text-h1 as a color and drops it next to text-text.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(tokens.text),
      color: Object.keys(tokens.color),
      radius: Object.keys(tokens.radius),
      shadow: Object.keys(tokens.shadow),
      container: Object.keys(tokens.container),
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * DESIGN_SYSTEM §06: a 2px primary ring with a 2px offset on every focusable control.
 * The offset takes --focus-offset, which surfaces set to their own background.
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-(--focus-offset)";
