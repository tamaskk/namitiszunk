"use client";

import { Button } from "@namitiszunk/ui";
import { LogOut } from "lucide-react";
import { useState } from "react";

import { authApi } from "@/lib/auth-api";

export function SignOutButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      className="min-w-12 px-3"
      aria-label={label}
      loading={pending}
      onClick={async () => {
        setPending(true);
        await authApi.signOut();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops the router cache of the other session
        window.location.assign("/sign-in");
      }}
    >
      <LogOut aria-hidden />
    </Button>
  );
}
