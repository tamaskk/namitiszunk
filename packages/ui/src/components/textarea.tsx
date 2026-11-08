import type { ComponentProps } from "react";

import { cn, focusRing } from "../lib/cn";

/** Multi-line Input: same tokens, grows with the text up to the browser's resize handle. */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 rounded-sm border border-border bg-surface px-3 py-3 text-body text-text transition-colors duration-150 placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
