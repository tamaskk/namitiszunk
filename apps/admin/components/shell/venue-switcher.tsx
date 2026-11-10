"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { selectVenueAction } from "@/app/(dashboard)/actions";

/** Shown only to members of more than one venue; the chain view is T-098. */
export function VenueSwitcher({
  venues,
  current,
}: {
  venues: { id: string; name: string }[];
  current: string;
}) {
  const t = useTranslations("admin.shell");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 flex-col">
      <Select
        value={current}
        disabled={pending}
        onValueChange={(venueId) =>
          startTransition(async () => {
            const result = await selectVenueAction({ venueId });
            setFailed("error" in result);
          })
        }
      >
        <SelectTrigger aria-label={t("venue")} className="w-auto max-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {venues.map((venue) => (
            <SelectItem key={venue.id} value={venue.id}>
              {venue.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {failed && (
        <p role="alert" className="text-small text-danger">
          {t("venueFailed")}
        </p>
      )}
    </div>
  );
}
