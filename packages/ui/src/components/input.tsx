import type { ComponentProps } from "react";

import { cn, focusRing } from "../lib/cn";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-sm border border-border bg-surface px-3 text-body text-text transition-colors duration-150 placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export { Input };
