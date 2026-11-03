import type { ComponentProps } from "react";

import { cn, focusRing } from "../lib/cn";

// Tables are the one place horizontal scrolling is allowed (DESIGN_SYSTEM §08).
type TableProps = ComponentProps<"table"> & {
  /** Translated name of the scroll region, so keyboard users can reach an overflowing table. */
  label: string;
};

function Table({ className, label, ...props }: TableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("relative w-full overflow-x-auto", focusRing)}
    >
      <table
        className={cn(
          "w-full caption-bottom text-small tabular-nums",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-12 px-3 text-left align-middle text-label whitespace-nowrap text-text-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("h-12 px-3 align-middle whitespace-nowrap", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-4 text-small text-text-muted", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
};
