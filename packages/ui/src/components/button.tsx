import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, MouseEvent } from "react";

import { cn, focusRing } from "../lib/cn";

// DESIGN_SYSTEM §06 Buttons: four variants, at least 48px high, 64px in the bar view, padding 0 16px.
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 whitespace-nowrap transition-colors duration-150 active:brightness-[0.88] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
    focusRing,
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border border-border bg-surface text-text hover:bg-border",
        ghost: "bg-transparent text-text hover:bg-surface",
        danger: "bg-danger text-bg hover:brightness-110",
      },
      size: {
        default: "h-12 text-small font-medium",
        bar: "h-16 text-body font-semibold",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> &
  (
    | { asChild?: false; loading?: boolean }
    // A slotted child (a link) renders its own content, so it cannot show the spinner.
    | { asChild: true; loading?: never }
  );

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  onClick,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  // Loading stays focusable (aria-disabled, not disabled) but swallows clicks, so a payment is never sent twice.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      <span
        className={cn("inline-flex items-center gap-2", loading && "opacity-0")}
      >
        {children}
      </span>
      {loading && (
        <Loader2Icon
          aria-hidden
          className="absolute animate-spin motion-reduce:animate-none"
        />
      )}
    </button>
  );
}

export { Button, buttonVariants };
