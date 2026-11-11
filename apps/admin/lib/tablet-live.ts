import type { BaseRealtime } from "ably/modular";

import { adminApi } from "@/lib/admin-api";

export type TabletLive = { connected(): boolean; close(): void };

/**
 * Ably for one tablet channel (a bar's or the venue's VIP channel): every message means "reload the
 * list", so the screen never patches state from a message it might have missed. The modular build
 * carries only WebSocket and fetch; a failed chunk load (offline) leaves the polling.
 */
export function connectTabletLive(
  venueId: string,
  channel: string,
  handlers: {
    onMessage(): void;
    onConnected(): void;
    onError(error: unknown): void;
  },
): TabletLive {
  let ably: BaseRealtime | null = null;
  let closed = false;
  import("ably/modular")
    .then(
      ({ BaseRealtime, FetchRequest, WebSocketTransport }) => {
        if (closed) return;
        ably = new BaseRealtime({
          plugins: { WebSocketTransport, FetchRequest },
          authCallback: (_params, callback) => {
            adminApi.realtime.token({ venueId }).then(
              (request) => callback(null, request),
              (error: unknown) => callback(String(error), null),
            );
          },
        });
        ably.channels
          .get(channel)
          .subscribe(() => handlers.onMessage())
          // Closing the page rejects a pending attach: only a failure while open is worth a report.
          .catch((error: unknown) => {
            if (!closed) handlers.onError(error);
          });
        ably.connection.on("connected", handlers.onConnected);
      },
      () => {
        // The chunk did not load (offline): polling keeps the list current.
      },
    )
    .catch(handlers.onError);
  return {
    connected: () => ably?.connection.state === "connected",
    close: () => {
      closed = true;
      ably?.close();
    },
  };
}
