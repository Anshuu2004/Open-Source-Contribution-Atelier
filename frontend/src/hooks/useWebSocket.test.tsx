import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "./useWebSocket";
import { useWebSocketManager } from "./useWebSocketManager";
import { useWebSocketWithBackoff } from "./useWebSocketWithBackoff";

class MockSocket {
  static instances: MockSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(public url: string) {
    MockSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const last = () => MockSocket.instances[MockSocket.instances.length - 1];

describe("websocket hooks", () => {
  beforeEach(() => {
    MockSocket.instances = [];
    vi.stubGlobal("WebSocket", MockSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("useWebSocket", () => {
    it("connects, reports messages and closes on unmount", () => {
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() =>
        useWebSocket({ url: "ws://t/a", onMessage }),
      );
      expect(result.current.state).toBe("CONNECTING");

      act(() => last().open());
      expect(result.current.isConnected).toBe(true);

      act(() => last().receive({ hello: "world" }));
      expect(result.current.lastMessage).toEqual({ hello: "world" });
      expect(onMessage).toHaveBeenCalledWith({ hello: "world" });

      const socket = last();
      unmount();
      expect(socket.readyState).toBe(3);
    });

    it("does not connect without a token when requireToken is set", () => {
      const { result, rerender } = renderHook(
        ({ token }: { token: string | null }) =>
          useWebSocket({ url: "ws://t/a", token, requireToken: true }),
        { initialProps: { token: null as string | null } },
      );
      expect(MockSocket.instances).toHaveLength(0);
      expect(result.current.state).toBe("CLOSED");

      rerender({ token: "abc" });
      expect(MockSocket.instances).toHaveLength(1);
      expect(last().url).toBe("ws://t/a?token=abc");
    });

    it("reconnects on a token change", () => {
      const { rerender } = renderHook(
        ({ token }: { token: string }) =>
          useWebSocket({ url: "ws://t/a", token }),
        { initialProps: { token: "one" } },
      );
      act(() => last().open());

      rerender({ token: "two" });
      expect(MockSocket.instances).toHaveLength(2);
      expect(last().url).toBe("ws://t/a?token=two");
    });

    it("exposes retries and reconnectExhausted", () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: "ws://t/a",
          maxReconnectAttempts: 1,
          reconnectInterval: 10,
          jitter: "none",
        }),
      );
      act(() => last().open());

      act(() => last().serverClose());
      expect(result.current.state).toBe("RECONNECTING");
      expect(result.current.retryCount).toBe(1);

      act(() => {
        vi.advanceTimersByTime(10);
      });
      act(() => last().serverClose());
      expect(result.current.reconnectExhausted).toBe(true);
      expect(result.current.lastError).toBe("Max retries (1) exceeded");

      act(() => result.current.connect());
      expect(result.current.reconnectExhausted).toBe(false);
    });

    it("send() returns false while disconnected", () => {
      const { result } = renderHook(() => useWebSocket({ url: "ws://t/a" }));
      let sent = true;
      act(() => {
        sent = result.current.send({ a: 1 });
      });
      expect(sent).toBe(false);
    });

    it("flushes the offline queue when the socket opens", () => {
      const { result } = renderHook(() =>
        useWebSocket({ url: "ws://t/a", queueOffline: true }),
      );
      act(() => {
        result.current.send({ n: 1 });
      });
      act(() => last().open());

      expect(last().sent).toEqual([JSON.stringify({ n: 1 })]);
    });

    it("does not touch the socket while enabled is false", () => {
      renderHook(() => useWebSocket({ url: "ws://t/a", enabled: false }));
      expect(MockSocket.instances).toHaveLength(0);
    });
  });

  describe("useWebSocketManager", () => {
    it("shares one connection per URL and keeps it after unmount", () => {
      const a = renderHook(() => useWebSocketManager({ url: "ws://t/shared" }));
      const b = renderHook(() => useWebSocketManager({ url: "ws://t/shared" }));
      expect(MockSocket.instances).toHaveLength(1);

      act(() => last().open());
      expect(a.result.current.isConnected).toBe(true);
      expect(b.result.current.isConnected).toBe(true);

      const socket = last();
      a.unmount();
      b.unmount();
      expect(socket.readyState).toBe(1);
    });

    it("keeps retrying without a limit", () => {
      const { result } = renderHook(() =>
        useWebSocketManager({ url: "ws://t/forever" }),
      );
      for (let i = 0; i < 15; i++) {
        act(() => last().serverClose());
        act(() => {
          vi.advanceTimersByTime(30000);
        });
      }
      expect(result.current.state).not.toBe("CLOSED");
    });
  });

  describe("useWebSocketWithBackoff", () => {
    it("maps the engine state to the old status strings", () => {
      const { result } = renderHook(() =>
        useWebSocketWithBackoff({ url: "ws://t/b", maxRetries: 1 }),
      );
      expect(result.current.status).toBe("connecting");

      act(() => last().open());
      expect(result.current.status).toBe("connected");
      expect(result.current.isConnected).toBe(true);

      act(() => last().serverClose());
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.retryCount).toBe(1);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      act(() => last().serverClose());
      expect(result.current.status).toBe("failed");
      expect(result.current.lastError).toBe("Max retries (1) exceeded");
    });

    it("treats a clean close as disconnected, not a retry", () => {
      const { result } = renderHook(() =>
        useWebSocketWithBackoff({ url: "ws://t/c" }),
      );
      act(() => last().open());
      act(() => last().serverClose(1000));

      expect(result.current.status).toBe("disconnected");
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      expect(MockSocket.instances).toHaveLength(1);
    });

    it("uses the plain doubling schedule without jitter", () => {
      renderHook(() => useWebSocketWithBackoff({ url: "ws://t/d" }));
      act(() => last().serverClose());
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(MockSocket.instances).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockSocket.instances).toHaveLength(2);
    });

    it("stays disconnected after disconnect() and recovers with reconnect()", () => {
      const { result } = renderHook(() =>
        useWebSocketWithBackoff({ url: "ws://t/e" }),
      );
      act(() => last().open());

      act(() => result.current.disconnect());
      expect(result.current.status).toBe("disconnected");

      act(() => result.current.reconnect());
      expect(result.current.status).toBe("connecting");
      act(() => last().open());
      expect(result.current.status).toBe("connected");
    });

    it("sends strings through untouched", () => {
      const { result } = renderHook(() =>
        useWebSocketWithBackoff({ url: "ws://t/f" }),
      );
      act(() => last().open());
      act(() => result.current.send("plain"));

      expect(last().sent).toEqual(["plain"]);
    });
  });
});
