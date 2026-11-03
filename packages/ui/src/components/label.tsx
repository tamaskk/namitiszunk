"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-small font-medium text-text select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
