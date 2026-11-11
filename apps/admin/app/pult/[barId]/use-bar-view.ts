"use client";

import { ApiError } from "@namitiszunk/api-client";
import type { BarViewResponse } from "@namitiszunk/validators";
import * as Sentry from "@sentry/nextjs";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { adminApi } from "@/lib/admin-api";
import {
  keepScreenAwake,
  onSoundUnlocked,
  playNewOrderSound,
  soundUnlocked,
  unlockTabletAlerts,
} from "@/lib/tablet-alerts";

import { connectBarLive } from "./bar-live";

const TICK_MS = 1_000;
// Without a live connection the board polls this often; with one, every message reloads it.
const POLL_MS = 5_000;
const PULSE_MS = 1_500;

/**
 * The bar's list (T-054): the server render first, then a full reload on every bar-channel message,
 * on every (re)connect and, while the socket is down, every few seconds. `online` is false while
 * the browser is offline or the last reload failed: the board then stays readable with every
 * button off (decision 2026-11-02).
 */
export function useBarView(venueId: string, initial: BarViewResponse) {
  const barId = initial.bar.id;
  const [view, setView] = useState(initial);
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  // The server never knows: no hint in the first paint.
  const soundOn = useSyncExternalStore(
    onSoundUnlocked,
    soundUnlocked,
    () => true,
  );
  const known = useRef(new Set(initial.orders.map((o) => o.id)));
  // Reloads overlap (a message, an action, the poll): only the latest one may set the board.
  const latest = useRef(0);
  const onlineRef = useRef(true);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const next = await adminApi.barView.get(barId);
      if (mine !== latest.current) return;
      const arrived = next.orders.filter(
        (o) => o.status === "new" && !known.current.has(o.id),
      );
      known.current = new Set(next.orders.map((o) => o.id));
      setView(next);
      onlineRef.current = navigator.onLine;
      setOnline(onlineRef.current);
      if (arrived.length > 0) {
        playNewOrderSound();
        setFresh(new Set(arrived.map((o) => o.id)));
        setTimeout(() => setFresh(new Set()), PULSE_MS);
      }
    } catch (error) {
      if (mine !== latest.current) return;
      onlineRef.current = false;
      setOnline(false);
      // A network failure is the offline state, not a bug; anything else is reported.
      if (!(error instanceof ApiError && error.code === "network_error"))
        Sentry.captureException(error);
    }
  }, [barId]);

  useEffect(() => {
    const live = connectBarLive(venueId, barId, {
      onMessage: () => void refresh(),
      // Every (re)connect may have missed messages: full sync.
      onConnected: () => void refresh(),
      onError: (error) => Sentry.captureException(error),
    });
    let lastPoll = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      // A failed reload with the socket up would otherwise stay "offline" until the next message.
      const stale = !live.connected() || !onlineRef.current;
      if (stale && now - lastPoll >= POLL_MS) {
        lastPoll = now;
        void refresh();
      }
    }, TICK_MS);
    const goOffline = () => {
      onlineRef.current = false;
      setOnline(false);
    };
    // After a reload or a PWA relaunch no PIN tap unlocked the sound: the first tap on the board does.
    const unlock = () => unlockTabletAlerts();
    window.addEventListener("pointerdown", unlock, { once: true });
    const goOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void keepScreenAwake();
      void refresh();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    void keepScreenAwake();
    return () => {
      clearInterval(tick);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlock);
      live.close();
    };
  }, [barId, refresh, venueId]);

  return { view, online, fresh, soundOn, refresh };
}
