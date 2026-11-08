// The device remembers the guest's open orders (T-043), so the menu (T-040) can point back to them.
// localStorage may be missing or full (private mode): failing to remember never breaks the page.
const KEY = "namitiszunk:open-orders";
// Longer than any night out: a borrowed phone does not keep someone else's order (and its cancel) for days.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type OpenOrder = { orderId: string; token: string; savedAt: number };

export function readOpenOrders(now = Date.now()): OpenOrder[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (o): o is OpenOrder =>
            typeof o?.orderId === "string" &&
            typeof o?.token === "string" &&
            typeof o?.savedAt === "number" &&
            now - o.savedAt < MAX_AGE_MS,
        )
      : [];
  } catch {
    return [];
  }
}

function write(orders: OpenOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    // Storage unavailable: the SMS link and the open tab still work.
  }
}

export function rememberOpenOrder(
  order: Omit<OpenOrder, "savedAt">,
  now = Date.now(),
) {
  const rest = readOpenOrders(now).filter((o) => o.orderId !== order.orderId);
  write([...rest, { ...order, savedAt: now }]);
}

/** Sign-out and account deletion: the next person on this phone must not claim these orders. */
export function forgetAllOpenOrders() {
  write([]);
}

export function forgetOpenOrder(orderId: string) {
  write(readOpenOrders().filter((o) => o.orderId !== orderId));
}
