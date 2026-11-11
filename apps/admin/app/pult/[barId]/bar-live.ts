import { barChannel } from "@namitiszunk/core/realtime/channels";
import type { BaseRealtime } from "ably/modular";

import { adminApi } from "@/lib/admin-api";

export type BarLive = { connected(): boolean; close(): void };

/**
 * Ably for one bar (T-054): every message on the bar channel (a status change or an `update`) means
 * "reload the list", so the board never patches state from a message it might have missed. The
 * modular build carries only WebSocket and fetch; a failed chunk load (offline) leaves the polling.
 */
export function connectBarLive(
  venueId: string,
  barId: string,
  handlers: {
    onMessage(): void;
    onConnected(): void;
    onError(error: unknown): void;
  },
): BarLive {
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
          .get(barChannel(venueId, barId))
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
