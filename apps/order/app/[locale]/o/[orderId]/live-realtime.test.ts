import { beforeEach, describe, expect, it, vi } from "vitest";

const ably = vi.hoisted(() => ({
  constructed: 0,
  fail: false,
  state: "connecting",
  close: vi.fn(),
  onConnected: undefined as (() => void) | undefined,
}));

vi.mock("ably/modular", () => {
  return {
    FetchRequest: {},
    WebSocketTransport: {},
    BaseRealtime: class {
      constructor() {
        if (ably.fail) throw new Error("bad options");
        ably.constructed++;
      }
      channels = { get: () => ({ subscribe: () => Promise.resolve() }) };
      connection = {
        get state() {
          return ably.state;
        },
        on: (_event: string, listener: () => void) => {
          ably.onConnected = listener;
        },
      };
      close = ably.close;
    },
  };
});
vi.mock("@/lib/order-api", () => ({ orderApi: { realtimeToken: vi.fn() } }));
const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry-client", () => ({ reportClientError: report }));

import { connectOrderLive } from "./live-realtime";

const handlers = () => ({ onStatus: vi.fn(), onConnected: vi.fn() });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("connectOrderLive", () => {
  beforeEach(() => {
    ably.constructed = 0;
    ably.fail = false;
    ably.state = "connecting";
    ably.close.mockClear();
    report.mockClear();
  });

  it("connects once the chunk loads and reports connected", async () => {
    const on = handlers();

    const live = connectOrderLive("o1", "t", on);
    expect(live.connected()).toBe(false);
    await settle();
    ably.state = "connected";
    ably.onConnected?.();

    expect(ably.constructed).toBe(1);
    expect(live.connected()).toBe(true);
    expect(on.onConnected).toHaveBeenCalledOnce();
  });

  it("does not connect when closed before the chunk loads", async () => {
    const live = connectOrderLive("o1", "t", handlers());

    live.close();
    await settle();

    expect(ably.constructed).toBe(0);
    expect(live.connected()).toBe(false);
  });

  it("closes the client after it loaded", async () => {
    const live = connectOrderLive("o1", "t", handlers());
    await settle();

    live.close();

    expect(ably.close).toHaveBeenCalledOnce();
  });

  it("reports an error thrown after the chunk loaded", async () => {
    ably.fail = true;

    const live = connectOrderLive("o1", "t", handlers());
    await settle();

    expect(report).toHaveBeenCalledOnce();
    expect(live.connected()).toBe(false);
  });
});
