import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedWebSocket, ManagedWebSocketOptions } from "./ws";

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

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    MockSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  // Test helpers
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

const created: ManagedWebSocket[] = [];

function make(
  options: ManagedWebSocketOptions = {},
  token: string | null = null,
) {
  const ws = new ManagedWebSocket("ws://test/ws/", token, {
    jitter: "none",
    ...options,
  });
  created.push(ws);
  return ws;
}

describe("ManagedWebSocket", () => {
  beforeEach(() => {
    MockSocket.instances = [];
    vi.stubGlobal("WebSocket", MockSocket);
  });

  afterEach(() => {
    // Drop the window "online" listeners so tests cannot affect each other.
    created.splice(0).forEach((ws) => ws.disconnect());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("backoff", () => {
    it("doubles the delay on each failed attempt and caps it", () => {
      const ws = make({ baseReconnectDelay: 1000, maxReconnectDelay: 5000 });
      ws.connect();

      const delays: number[] = [];
      for (let i = 0; i < 5; i++) {
        last().serverClose();
        const before = MockSocket.instances.length;
        let waited = 0;
        while (MockSocket.instances.length === before && waited < 10000) {
          vi.advanceTimersByTime(250);
          waited += 250;
        }
        delays.push(waited);
      }

      expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
    });

    it("honours a custom multiplier", () => {
      const ws = make({ baseReconnectDelay: 100, backoffMultiplier: 3 });
      ws.connect();

      last().serverClose();
      vi.advanceTimersByTime(99);
      expect(MockSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockSocket.instances).toHaveLength(2);

      last().serverClose();
      vi.advanceTimersByTime(299);
      expect(MockSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockSocket.instances).toHaveLength(3);
    });

    it("picks a delay in [0, backoff] with full jitter", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const ws = make({ jitter: "full", baseReconnectDelay: 1000 });
      ws.connect();

      last().serverClose();
      vi.advanceTimersByTime(499);
      expect(MockSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockSocket.instances).toHaveLength(2);
    });

    it("starts again from the base delay after a successful open", () => {
      const ws = make({ baseReconnectDelay: 1000 });
      ws.connect();
      last().serverClose();
      vi.advanceTimersByTime(1000);
      last().serverClose();
      vi.advanceTimersByTime(2000);
      last().open();
      expect(ws.retryCount).toBe(0);

      last().serverClose();
      vi.advanceTimersByTime(999);
      const count = MockSocket.instances.length;
      vi.advanceTimersByTime(1);
      expect(MockSocket.instances).toHaveLength(count + 1);
    });
  });

  describe("max retries", () => {
    it("gives up after maxRetries reconnects and reports it", () => {
      const ws = make({ maxRetries: 2, baseReconnectDelay: 10 });
      ws.connect();

      last().serverClose();
      expect(ws.state).toBe("RECONNECTING");
      expect(ws.retryCount).toBe(1);
      vi.advanceTimersByTime(10);

      last().serverClose();
      expect(ws.retryCount).toBe(2);
      vi.advanceTimersByTime(20);

      last().serverClose();
      expect(ws.state).toBe("CLOSED");
      expect(ws.reconnectExhausted).toBe(true);
      expect(ws.getMetrics().lastError).toBe("Max retries (2) exceeded");

      const sockets = MockSocket.instances.length;
      vi.advanceTimersByTime(60000);
      expect(MockSocket.instances).toHaveLength(sockets);
    });

    it("lets connect() start a fresh series after exhaustion", () => {
      const ws = make({ maxRetries: 0 });
      ws.connect();
      last().serverClose();
      expect(ws.reconnectExhausted).toBe(true);

      ws.connect();
      expect(ws.reconnectExhausted).toBe(false);
      expect(ws.state).toBe("CONNECTING");
      expect(MockSocket.instances).toHaveLength(2);
    });

    it("never gives up by default", () => {
      const ws = make({ baseReconnectDelay: 1, maxReconnectDelay: 1 });
      ws.connect();
      for (let i = 0; i < 50; i++) {
        last().serverClose();
        vi.advanceTimersByTime(1);
      }
      expect(ws.reconnectExhausted).toBe(false);
      expect(MockSocket.instances).toHaveLength(51);
    });
  });

  describe("close handling", () => {
    it("does not reconnect after disconnect()", () => {
      const ws = make();
      ws.connect();
      last().open();
      ws.disconnect();

      vi.advanceTimersByTime(60000);
      expect(ws.state).toBe("CLOSED");
      expect(MockSocket.instances).toHaveLength(1);
    });

    it("does not reconnect when reconnect is off", () => {
      const ws = make({ reconnect: false });
      ws.connect();
      last().serverClose();

      vi.advanceTimersByTime(60000);
      expect(ws.state).toBe("CLOSED");
      expect(MockSocket.instances).toHaveLength(1);
    });

    it("can treat a clean close as final", () => {
      const ws = make({ reconnectOnCleanClose: false });
      ws.connect();
      last().serverClose(1000);

      vi.advanceTimersByTime(60000);
      expect(ws.state).toBe("CLOSED");
      expect(ws.reconnectExhausted).toBe(false);
      expect(MockSocket.instances).toHaveLength(1);
    });

    it("reconnects as soon as the browser comes back online", () => {
      const ws = make({ baseReconnectDelay: 30000 });
      ws.connect();
      last().serverClose();
      expect(MockSocket.instances).toHaveLength(1);

      window.dispatchEvent(new Event("online"));
      expect(MockSocket.instances).toHaveLength(2);
      expect(ws.retryCount).toBe(0);
    });

    it("ignores the online event after disconnect()", () => {
      const ws = make();
      ws.connect();
      ws.disconnect();

      window.dispatchEvent(new Event("online"));
      expect(MockSocket.instances).toHaveLength(1);
    });
  });

  describe("heartbeat", () => {
    it("closes the socket when no pong arrives", () => {
      const ws = make({ heartbeatInterval: 1000, heartbeatTimeout: 500 });
      ws.connect();
      const socket = last();
      socket.open();

      vi.advanceTimersByTime(1000);
      expect(socket.sent).toEqual([JSON.stringify({ action: "ping" })]);

      vi.advanceTimersByTime(500);
      expect(socket.readyState).toBe(3);
      expect(ws.getMetrics().lastError).toBe("Heartbeat timeout");
    });

    it("keeps the socket when the pong arrives in time", () => {
      const ws = make({ heartbeatInterval: 1000, heartbeatTimeout: 500 });
      ws.connect();
      const socket = last();
      socket.open();

      vi.advanceTimersByTime(1000);
      socket.receive({ type: "pong" });
      vi.advanceTimersByTime(400);

      expect(socket.readyState).toBe(1);
    });

    it("sends the configured ping payload", () => {
      const ws = make({
        heartbeatInterval: 1000,
        pingMessage: { type: "ping" },
      });
      ws.connect();
      last().open();
      vi.advanceTimersByTime(1000);

      expect(last().sent).toEqual([JSON.stringify({ type: "ping" })]);
    });

    it("sends nothing when the heartbeat is off", () => {
      const ws = make({ heartbeat: false, heartbeatInterval: 1000 });
      ws.connect();
      last().open();
      vi.advanceTimersByTime(10000);

      expect(last().sent).toEqual([]);
    });
  });

  describe("offline queue", () => {
    it("drops messages while disconnected by default", () => {
      const ws = make();
      ws.connect();

      expect(ws.send({ a: 1 })).toBe(false);
      last().open();
      expect(last().sent).toEqual([]);
    });

    it("queues messages and flushes them in order on open", () => {
      const ws = make({ queueOffline: true });
      ws.connect();

      expect(ws.send({ n: 1 })).toBe(true);
      expect(ws.send("raw")).toBe(true);
      expect(ws.queuedCount).toBe(2);

      last().open();
      expect(last().sent).toEqual([JSON.stringify({ n: 1 }), "raw"]);
      expect(ws.queuedCount).toBe(0);
    });

    it("flushes messages queued during a reconnect", () => {
      const ws = make({ queueOffline: true, baseReconnectDelay: 100 });
      ws.connect();
      last().open();
      last().serverClose();

      ws.send({ n: 2 });
      vi.advanceTimersByTime(100);
      last().open();

      expect(last().sent).toEqual([JSON.stringify({ n: 2 })]);
    });

    it("drops the oldest messages beyond maxQueueSize", () => {
      const ws = make({ queueOffline: true, maxQueueSize: 2 });
      ws.connect();
      ws.send("a");
      ws.send("b");
      ws.send("c");

      last().open();
      expect(last().sent).toEqual(["b", "c"]);
    });

    it("does not queue after an explicit disconnect()", () => {
      const ws = make({ queueOffline: true });
      ws.connect();
      ws.disconnect();

      expect(ws.send("x")).toBe(false);
      expect(ws.queuedCount).toBe(0);
    });
  });

  it("appends the token to the URL and passes protocols through", () => {
    const ws = make({ protocols: ["v1"] }, "a b");
    ws.connect();

    expect(last().url).toBe("ws://test/ws/?token=a%20b");
    expect(last().protocols).toEqual(["v1"]);
  });

  it("sends binary payloads untouched", () => {
    const ws = make();
    ws.connect();
    last().open();
    const buf = new ArrayBuffer(4);

    ws.send(buf);
    expect(last().sent).toEqual([buf]);
  });
});
