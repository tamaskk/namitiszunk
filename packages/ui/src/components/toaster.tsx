"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Dark is the only theme in v1. Top-center keeps toasts clear of the guest app's sticky bottom bar.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "text-body",
          actionButton: "min-h-12 px-4 text-small font-medium",
          cancelButton: "min-h-12 px-4 text-small font-medium",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-text)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius-lg)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { toast } from "sonner";
export { Toaster };
