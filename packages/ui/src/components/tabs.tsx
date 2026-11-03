"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn, focusRing } from "../lib/cn";

const Tabs = TabsPrimitive.Root;

function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-14 items-center gap-1 rounded-lg border border-border bg-surface p-1 [--focus-offset:var(--color-surface)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-md px-4 text-small font-medium text-text-muted transition-colors duration-150 hover:text-text disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-border data-[state=active]:text-text data-[state=active]:ring-1 data-[state=active]:ring-primary data-[state=active]:ring-inset",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
