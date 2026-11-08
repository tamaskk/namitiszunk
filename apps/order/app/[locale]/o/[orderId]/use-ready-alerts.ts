"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const noSubscribe = () => () => {};

function beep(ctx: AudioContext, times: number) {
  for (let i = 0; i < times; i++) {
    const start = ctx.currentTime + i * 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  }
}

/**
 * Sound, vibration, a blinking tab title and a screen wake lock for the Ready moment.
 * Browsers play sound only after a tap, and a redirect from payment is not one: `enableSound` is that tap.
 */
export function useReadyAlerts({
  ready,
  wakeLock,
  readyTitle,
}: {
  ready: boolean;
  wakeLock: boolean;
  readyTitle: string;
}) {
  const audio = useRef<AudioContext | null>(null);
  // Read inside the Ready effect without re-running it (a re-run would beep and vibrate again).
  const title = useRef(readyTitle);
  useEffect(() => {
    title.current = readyTitle;
  }, [readyTitle]);
  const [soundOn, setSoundOn] = useState(false);
  // null until the request settles; false when it failed.
  const [awake, setAwake] = useState<boolean | null>(null);
  // false on the server render, so the "keep it open" hint appears only after hydration.
  const unsupported = useSyncExternalStore(
    noSubscribe,
    () => !("wakeLock" in navigator),
    () => false,
  );

  const enableSound = useCallback(() => {
    const ctx = audio.current ?? new AudioContext();
    audio.current = ctx;
    void ctx.resume();
    // A short tone inside the tap unlocks audio on iOS and confirms it works.
    beep(ctx, 1);
    setSoundOn(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const ctx = audio.current;
    // iOS suspends the context after an interruption (a call, a locked screen).
    if (ctx) void ctx.resume().then(() => beep(ctx, 3));
    // Android only; iOS Safari has no vibration API.
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    const original = document.title;
    let on = false;
    const blink = setInterval(() => {
      on = !on;
      document.title = on ? title.current : original;
    }, 1000);
    return () => {
      clearInterval(blink);
      document.title = original;
    };
  }, [ready]);

  useEffect(() => () => void audio.current?.close(), []);

  useEffect(() => {
    if (!wakeLock || unsupported) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const request = () => {
      if (sentinel && !sentinel.released) return Promise.resolve();
      return navigator.wakeLock.request("screen").then(
        (s) => {
          if (stopped) {
            void s.release();
            return;
          }
          sentinel = s;
          setAwake(true);
          // The system may drop the lock (low battery, hidden tab).
          s.addEventListener("release", () => {
            if (!stopped) setAwake(false);
          });
        },
        () => setAwake(false),
      );
    };
    // The lock is released whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [unsupported, wakeLock]);

  return { soundOn, enableSound, awake: unsupported ? false : awake };
}
