"use client";

import type { VenueStatusResponse } from "@namitiszunk/validators";
import { useEffect, useState } from "react";

const POLL_MS = 30_000;

/**
 * Polls the live status every 30 s while the tab is visible, and once on coming back.
 * A failed poll or an `offline` event keeps the last status and flags it as possibly stale.
 */
export function useVenueStatus(
  slug: string,
  barId: string | null,
  initial: VenueStatusResponse,
  renderedAt: number,
) {
  // `at` turns pausedUntil into minutes without reading the clock during render.
  const [live, setLive] = useState({
    status: initial,
    at: renderedAt,
    stale: false,
  });
  // Bumped when a pause ends, so the pay and add buttons come back without waiting for the next poll.
  const [pauseEnded, setPauseEnded] = useState(0);
  const pausedUntil = live.status.pausedUntil;
  useEffect(() => {
    if (!pausedUntil) return;
    const timer = setTimeout(
      () => setPauseEnded((n) => n + 1),
      Math.max(1000, Date.parse(pausedUntil) - Date.now() + 1000),
    );
    return () => clearTimeout(timer);
  }, [pausedUntil]);
  useEffect(() => {
    const url = `/api/venues/${slug}/status${barId ? `?bar=${barId}` : ""}`;
    let active = true;
    const markStale = () =>
      active && setLive((current) => ({ ...current, stale: true }));
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`status ${response.status}`);
        const body = (await response.json()) as { data: VenueStatusResponse };
        if (active)
          setLive({ status: body.data, at: Date.now(), stale: false });
      } catch {
        // Offline or a failed request: keep the last status, say it may be old, retry next tick.
        markStale();
      }
    };
    const onVisible = () => void poll();
    const timer = setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("offline", markStale);
    if (pauseEnded > 0) void poll();
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("offline", markStale);
    };
  }, [slug, barId, pauseEnded]);
  return live;
}
