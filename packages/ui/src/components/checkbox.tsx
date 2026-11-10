"use client";

import { useId } from "react";

import { cn, focusRing } from "../lib/cn";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible, translated label; the whole 48px row toggles the box. */
  label: string;
  /** Optional muted line under the row, read out with the box. */
  hint?: string;
  className?: string;
};

// DESIGN_SYSTEM §06 Checkbox: a native box (keyboard and form behaviour for free) in a 48px label row.
function Checkbox({
  checked,
  onChange,
  label,
  hint,
  className,
}: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col", className)}>
      <label
        htmlFor={id}
        className="flex min-h-12 cursor-pointer items-center gap-3 text-small font-medium text-text"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn("size-5 shrink-0 rounded-sm accent-primary", focusRing)}
        />
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-small text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export { Checkbox };
