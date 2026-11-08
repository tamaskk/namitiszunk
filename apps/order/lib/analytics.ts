import "server-only";

type MenuViewed = { venueId: string; barId: string | null; source?: string };

/** The `menu_viewed` event; `source` is the QR code's `q` parameter (T-053). */
export function trackMenuViewed(event: MenuViewed): void {
  // shortcut: no analytics before T-018, wire to T-018
  void event;
}
