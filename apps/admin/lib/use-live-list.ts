"use client";

import { ApiError } from "@namitiszunk/api-client";
import * as Sentry from "@sentry/nextjs";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  keepScreenAwake,
  onSoundUnlocked,
  alertArrival,
  soundUnlocked,
  unlockTabletAlerts,
} from "./tablet-alerts";

import { connectTabletLive } from "./tablet-live";

const TICK_MS = 1_000;
// Without a live connection the board polls this often; with one, every message reloads it.
const POLL_MS = 5_000;
const PULSE_MS = 1_500;

type LiveOrder = { id: string; status: string };

/**
 * A tablet's live list (T-054 bar view, T-055 VIP view): the server render first, then a full
 * reload on every message of `channel`, on every (re)connect and, while the socket is down or the
 * last reload failed, every few seconds. `online` is false while the browser is offline or the
 * last reload failed: the screen then stays readable with every button off (decision 2026-11-02).
 * `arrived` picks the orders that should sound (a new one at the bar, a ready one for the VIP host).
 */
export function useLiveList<V extends { orders: readonly LiveOrder[] }>({
  venueId,
  channel,
  initial,
  load,
  arrived: isArrival,
}: {
  venueId: string;
  channel: string;
  initial: V;
  /** Stable (useCallback): a new function reconnects. */
  load: () => Promise<V>;
  arrived: (order: LiveOrder, statusBefore: string | undefined) => boolean;
}) {
  const [view, setView] = useState(initial);
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  // The server never knows: no hint in the first paint.
  const soundOn = useSyncExternalStore(
    onSoundUnlocked,
    soundUnlocked,
    () => true,
  );
  const known = useRef(
    new Map<string, string>(initial.orders.map((o) => [o.id, o.status])),
  );
  // Reloads overlap (a message, an action, the poll): only the latest one may set the board.
  const latest = useRef(0);
  const onlineRef = useRef(true);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const next = await load();
      if (mine !== latest.current) return;
      const arrived = next.orders.filter((o) =>
        isArrival(o, known.current.get(o.id)),
      );
      known.current = new Map(next.orders.map((o) => [o.id, o.status]));
      setView(next);
      onlineRef.current = navigator.onLine;
      setOnline(onlineRef.current);
      if (arrived.length > 0) {
        alertArrival();
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
  }, [isArrival, load]);

  useEffect(() => {
    const live = connectTabletLive(venueId, channel, {
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
  }, [channel, refresh, venueId]);

  return { view, online, fresh, soundOn, refresh };
}
