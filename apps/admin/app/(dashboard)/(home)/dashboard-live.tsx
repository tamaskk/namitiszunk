"use client";

import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { connectTabletLive } from "@/lib/tablet-live";

// Peak hours bring a message every second: at most one reload per this window (T-063).
const THROTTLE_MS = 5_000;
// Without a live connection the page polls this often instead.
const POLL_MS = 5_000;

/** Reloads the Dashboard on every bar channel message, at most once per 5 s, and polls while offline. */
export function DashboardLive({
  venueId,
  channels,
}: {
  venueId: string;
  channels: readonly string[];
}) {
  const router = useRouter();
  // A stable dependency: the server sends a new array on every render.
  const channelKey = channels.join(" ");

  useEffect(() => {
    // The server render is fresh: the first message or connect waits out one window.
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;
    const reload = () => {
      // A poll covers any message still waiting for its window.
      clearTimeout(timer);
      timer = undefined;
      last = Date.now();
      router.refresh();
    };
    // The last message of a burst is never dropped: it waits for the window to end.
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(
        () => {
          timer = undefined;
          reload();
        },
        Math.max(0, last + THROTTLE_MS - Date.now()),
      );
    };
    const live = connectTabletLive(venueId, channelKey.split(" "), {
      onMessage: schedule,
      // A reconnect may have missed messages; the first connect follows the fresh server render.
      onConnected: () => {
        if (connectedBefore) schedule();
        connectedBefore = true;
      },
      onError: (error) => Sentry.captureException(error),
    });
    const poll = setInterval(() => {
      if (!live.connected() && Date.now() - last >= POLL_MS) reload();
    }, 1_000);
    return () => {
      live.close();
      clearInterval(poll);
      clearTimeout(timer);
    };
  }, [venueId, channelKey, router]);

  return null;
}
