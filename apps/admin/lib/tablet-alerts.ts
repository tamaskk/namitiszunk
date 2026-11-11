// Sound and screen wake for the bar and VIP tablets (T-054, T-055). Browsers allow audio only
// after a user gesture, so the first PIN tap unlocks it; the context lives on across client
// navigations to the board.

let audio: AudioContext | null = null;
let wakeLock: WakeLockSentinel | null = null;
const unlockListeners = new Set<() => void>();

/** Call from a tap: creates or resumes the audio context and asks for the wake lock. */
export function unlockTabletAlerts(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    for (const listener of unlockListeners) listener();
  } catch {
    // No Web Audio (very old browser): the card pulse still shows the new order.
  }
  void keepScreenAwake();
}

/** False until a tap has unlocked the audio in this page load. */
export function soundUnlocked(): boolean {
  return audio !== null && audio.state !== "closed";
}

/** For useSyncExternalStore: tells the board when a tap unlocked the sound. */
export function onSoundUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

/** Two short, sharp beeps that cut through bar noise. */
export function playNewOrderSound(): void {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime;
  for (const offset of [0, 0.22]) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "square";
    tone.frequency.value = 1320;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
    tone.connect(gain).connect(audio.destination);
    tone.start(start + offset);
    tone.stop(start + offset + 0.18);
  }
}

/** A new order for this screen: the beeps, plus a buzz on phones that can (Android; iOS has no vibrate). */
export function alertArrival(): void {
  playNewOrderSound();
  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
}

/** Asks for the screen wake lock; the browser drops it when the tab hides, so call again when visible. */
export async function keepScreenAwake(): Promise<void> {
  if (!("wakeLock" in navigator) || (wakeLock && !wakeLock.released)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    // Refused (low battery, older iPad): training covers turning auto-lock off on the tablet.
  }
}
