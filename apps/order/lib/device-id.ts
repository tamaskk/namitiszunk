// A random id for this browser, so the promo limits (T-060) count per phone, not per club wifi.
// A guest can clear it, so the API keeps a loose per-IP limit too. Nothing ties it to a person, it is
// kept only for abuse prevention (docs/SECURITY.md), and a new one replaces it after a day.
const KEY = "namitiszunk:device-id";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Without storage (some private modes) the id lives as long as the page, so a code still works.
let pageId: string | undefined;

type Stored = { id: string; createdAt: number };

/** This browser's id, created on first use and renewed after a day. */
export function deviceId(now = Date.now()): string {
  try {
    const stored = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Stored | null;
    // An edited or old value is replaced: the API would refuse a malformed one.
    if (
      typeof stored?.id === "string" &&
      UUID.test(stored.id) &&
      typeof stored.createdAt === "number" &&
      now - stored.createdAt < MAX_AGE_MS
    ) {
      return stored.id;
    }
    const fresh: Stored = { id: crypto.randomUUID(), createdAt: now };
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh.id;
  } catch {
    pageId ??= crypto.randomUUID();
    return pageId;
  }
}
