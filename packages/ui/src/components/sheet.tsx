"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";
import { closeButtonClass, overlayClass } from "./dialog";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

// Phones get the cart and product details as a bottom sheet (DESIGN_SYSTEM §06).
const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-surface p-6 text-text shadow-overlay outline-none [--focus-offset:var(--color-surface)]",
  {
    variants: {
      side: {
        bottom: "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t",
        right: "inset-y-0 right-0 w-full max-w-sm border-l",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    /** Accessible name of the close button; pass a translated string. */
    closeLabel: string;
  };

function SheetContent({
  className,
  children,
  side,
  closeLabel,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClass} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className={closeButtonClass}>
          <XIcon aria-hidden />
          <span className="sr-only">{closeLabel}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

// pr-12 keeps a long title clear of the 48px close button.
function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-2 pr-12", className)} {...props} />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title className={cn("text-h3", className)} {...props} />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-small text-text-muted", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
