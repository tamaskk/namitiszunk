import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

// DESIGN_SYSTEM §06: one variant per order status.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-sm border h-6 px-2 text-label whitespace-nowrap [&>svg]:size-4",
  {
    variants: {
      status: {
        new: "border-primary text-primary",
        inProgress: "border-warning bg-warning text-bg",
        ready: "border-primary bg-primary text-on-primary",
        pickedUp: "border-success bg-success text-bg",
        rejected: "border-danger bg-danger text-bg",
      },
    },
    defaultVariants: { status: "new" },
  },
);

function Badge({
  className,
  status,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ status }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
