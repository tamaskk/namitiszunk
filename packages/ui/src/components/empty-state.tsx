import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn";

type EmptyStateProps = ComponentProps<"div"> & {
  /** One translated line saying what belongs here. */
  message: string;
  /** The one primary action, usually a <Button>. */
  action?: ReactNode;
};

// DESIGN_SYSTEM §06: never a blank panel, one line plus one primary action.
function EmptyState({ message, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 text-center",
        className,
      )}
      {...props}
    >
      <p className="text-body text-text-muted">{message}</p>
      {action}
    </div>
  );
}

export { EmptyState };
