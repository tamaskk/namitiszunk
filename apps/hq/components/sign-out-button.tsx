"use client";

import { Button } from "@namitiszunk/ui";
import { useState } from "react";

import { authApi } from "@/lib/auth-api";

export function SignOutButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await authApi.signOut();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops the router cache of the other session
        window.location.assign("/sign-in");
      }}
    >
      {label}
    </Button>
  );
}
