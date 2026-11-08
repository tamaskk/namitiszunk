import {
  orderChannel,
  STATUS_EVENT,
  type StatusMessage,
} from "@namitiszunk/core/realtime/channels";
import type { BaseRealtime } from "ably/modular";

import { orderApi } from "@/lib/order-api";
import { reportClientError } from "@/lib/sentry-client";

export type LiveConnection = { connected(): boolean; close(): void };

/**
 * Ably for one order, loaded after the first paint (T-049 JS budget). The modular build carries only
 * WebSocket and fetch. A failed chunk load (offline) is left to the caller's polling; anything that
 * breaks after it loaded is reported.
 */
export function connectOrderLive(
  orderId: string,
  token: string,
  handlers: { onStatus(data: StatusMessage): void; onConnected(): void },
): LiveConnection {
  let ably: BaseRealtime | null = null;
  let closed = false;
  import("ably/modular")
    .then(
      ({ BaseRealtime, FetchRequest, WebSocketTransport }) => {
        if (closed) return;
        ably = new BaseRealtime({
          plugins: { WebSocketTransport, FetchRequest },
          authCallback: (_params, callback) => {
            orderApi.realtimeToken(token).then(
              (request) => callback(null, request),
              (error: unknown) => callback(String(error), null),
            );
          },
        });
        void ably.channels
          .get(orderChannel(orderId))
          .subscribe(STATUS_EVENT, (message) =>
            handlers.onStatus(message.data as StatusMessage),
          );
        ably.connection.on("connected", handlers.onConnected);
      },
      () => {
        // The chunk did not load (offline): polling keeps the order current.
      },
    )
    .catch(reportClientError);
  return {
    connected: () => ably?.connection.state === "connected",
    close: () => {
      closed = true;
      ably?.close();
    },
  };
}
