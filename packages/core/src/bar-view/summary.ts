// Pure and client-safe (T-054): the bar view renders these from the card list it already has.

export type SummaryLine = {
  name: string;
  options: string[];
  quantity: number;
};

export type SummaryOrder = {
  status: string;
  items: SummaryLine[];
};

/**
 * The peak-hour summary: identical items (same name, same options in any order) across the New
 * and In progress columns, added up and largest first ("12× Cerveza").
 */
export function rushSummary(orders: readonly SummaryOrder[]): SummaryLine[] {
  const lines = new Map<string, SummaryLine>();
  for (const order of orders) {
    if (order.status !== "new" && order.status !== "preparing") continue;
    for (const item of order.items) {
      const options = [...item.options].sort();
      const key = JSON.stringify([item.name, options]);
      const line = lines.get(key);
      if (line) line.quantity += item.quantity;
      else
        lines.set(key, { name: item.name, options, quantity: item.quantity });
    }
  }
  return [...lines.values()].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "hu"),
  );
}

export type CardAge = "fresh" | "waiting" | "late";

/** The card's waiting colour: green under 5 minutes, yellow from 5 to 10, red over 10. */
export function cardAge(since: Date, now: Date): CardAge {
  const minutes = (now.getTime() - since.getTime()) / 60_000;
  if (minutes < 5) return "fresh";
  return minutes <= 10 ? "waiting" : "late";
}
