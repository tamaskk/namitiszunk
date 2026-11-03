"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn, focusRing } from "../lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const overlayClass = "fixed inset-0 z-50 bg-overlay";
const closeButtonClass = cn(
  "absolute top-3 right-3 inline-flex size-12 items-center justify-center rounded-md text-text-muted hover:text-text [&_svg]:size-5",
  focusRing,
);

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> &
  (
    | {
        /** Accessible name of the close button; pass a translated string. */
        closeLabel: string;
        destructive?: false;
      }
    | {
        // DESIGN_SYSTEM §06: a destructive dialog closes only through its explicit buttons.
        destructive: true;
        closeLabel?: never;
      }
  );

function DialogContent({
  className,
  children,
  closeLabel,
  destructive = false,
  onInteractOutside,
  onEscapeKeyDown,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-dialog overflow-y-auto [--focus-offset:var(--color-surface)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-surface p-6 text-text shadow-overlay outline-none",
          className,
        )}
        onInteractOutside={(event) => {
          if (destructive) event.preventDefault();
          onInteractOutside?.(event);
        }}
        onEscapeKeyDown={(event) => {
          if (destructive) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        {...props}
      >
        {children}
        {closeLabel && (
          <DialogPrimitive.Close className={closeButtonClass}>
            <XIcon aria-hidden />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-2 pr-12", className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("text-h3", className)} {...props} />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-small text-text-muted", className)}
      {...props}
    />
  );
}

export {
  closeButtonClass,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  overlayClass,
};
