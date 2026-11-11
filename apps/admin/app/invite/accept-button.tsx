"use client";

import { Button } from "@namitiszunk/ui";
import { useFormStatus } from "react-dom";

/** The accept form's submit: busy while the server action runs, so a second tap sends nothing. */
export function AcceptButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="self-start" loading={pending}>
      {label}
    </Button>
  );
}
