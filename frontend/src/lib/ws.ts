type WSEventMap = {
  open: () => void;
  message: (data: any) => void;
  close: (code: number, reason: string) => void;
  error: (err: any) => void;
  stateChange: (state: ManagedWebSocket["state"]) => void;
};

export type ManagedWebSocketState =
  "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED" | "RECONNECTING";

/**
 * Options for the single WebSocket engine used by every hook.
 * All fields are optional; the defaults match the previous ManagedWebSocket.
 */
export interface ManagedWebSocketOptions {
  /** Sub-protocols passed to the WebSocket constructor. */
  protocols?: string | string[];

  /** Reconnect automatically after an unexpected close. Default true. */
  reconnect?: boolean;
  /** Reconnect after a clean close (code 1000). Default true. */
  reconnectOnCleanClose?: boolean;
  /** Reconnect as soon as the browser reports it is back online. Default true. */
  reconnectOnOnline?: boolean;
  /** Reconnect attempts before giving up. Default Infinity. */
  maxRetries?: number;

  /** First backoff delay in ms. Default 1000. */
  baseReconnectDelay?: number;
  /** Backoff cap in ms. Default 30000. */
  maxReconnectDelay?: number;
  /** Growth factor per attempt. Default 2. */
  backoffMultiplier?: number;
  /** "full" picks a random delay in [0, backoff]; "none" uses the backoff as is. Default "full". */
  jitter?: "full" | "none";

  /** Send periodic pings and drop the socket when no pong arrives. Default true. */
  heartbeat?: boolean;
  /** Ping every N ms. Default 30000. */
  heartbeatInterval?: number;
  /** Wait N ms for a pong before closing the socket. Default 15000. */
  heartbeatTimeout?: number;
  /** Payload sent as the ping. Default { action: "ping" }. */
  pingMessage?: unknown;

  /** Keep messages sent while disconnected and flush them on reconnect. Default false. */
  queueOffline?: boolean;
  /** Oldest queued messages are dropped beyond this size. Default 100. */
  maxQueueSize?: number;
}

type ResolvedOptions = Required<
  Omit<ManagedWebSocketOptions, "protocols" | "pingMessage">
> &
  Pick<ManagedWebSocketOptions, "protocols"> & { pingMessage: unknown };

const DEFAULT_OPTIONS: ResolvedOptions = {
  protocols: undefined,
  reconnect: true,
  reconnectOnCleanClose: true,
  reconnectOnOnline: true,
  maxRetries: Infinity,
  baseReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  backoffMultiplier: 2,
  jitter: "full",
  heartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 15000,
  pingMessage: { action: "ping" },
  queueOffline: false,
  maxQueueSize: 100,
};

function isRawPayload(data: unknown): data is string | ArrayBufferLike | Blob {
  return (
    typeof data === "string" ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data) ||
    (typeof Blob !== "undefined" && data instanceof Blob)
  );
}

export class ManagedWebSocket {
  private url: string;
  public token: string | null;
  private ws: WebSocket | null = null;

  // Connection State
  public state: ManagedWebSocketState = "CLOSED";
  /** True once maxRetries reconnects failed; cleared by connect(). */
  public reconnectExhausted = false;

  // Configuration
  private options: ResolvedOptions;

  // Timers
  private heartbeatTimer: any = null;
  private timeoutTimer: any = null;
  private reconnectTimer: any = null;

  // Reconnection info
  private reconnectAttempts = 0;
  private manuallyClosed = false;
  private onlineListenerAttached = false;

  // Messages waiting for the socket to open (only when queueOffline is on)
  private queue: unknown[] = [];

  // Event listeners
  private listeners: { [K in keyof WSEventMap]?: Array<WSEventMap[K]> } = {};

  // Metrics
  private metrics = {
    connectTime: 0,
    uptime: 0,
    reconnectionCount: 0,
    lastError: null as string | null,
    messagesSent: 0,
    messagesReceived: 0,
  };

  constructor(
    url: string,
    token: string | null = null,
    options: ManagedWebSocketOptions = {},
  ) {
    this.url = url;
    this.token = token;
    this.options = { ...DEFAULT_OPTIONS, ...stripUndefined(options) };
  }

  /** Reconnect attempts made or scheduled during the current outage. */
  public get retryCount(): number {
    return this.reconnectAttempts;
  }

  public get queuedCount(): number {
    return this.queue.length;
  }

  public updateToken(newToken: string | null) {
    if (this.token !== newToken) {
      this.token = newToken;
      if (this.state === "OPEN" || this.state === "CONNECTING") {
        this.disconnect();
        this.connect();
      }
    }
  }

  private buildUrl(): string {
    if (!this.token) return this.url;
    const separator = this.url.includes("?") ? "&" : "?";
    return `${this.url}${separator}token=${encodeURIComponent(this.token)}`;
  }

  public connect() {
    if (this.state === "OPEN" || this.state === "CONNECTING") return;

    this.manuallyClosed = false;
    this.cleanupTimers();
    this.attachOnlineListener();
    if (this.reconnectExhausted) {
      // An explicit connect() after giving up starts a fresh series of retries.
      this.reconnectExhausted = false;
      this.reconnectAttempts = 0;
    }
    if (this.state !== "RECONNECTING") {
      this.setState("CONNECTING");
    }

    this.detachSocket(true);

    try {
      const wsUrl = this.buildUrl();
      this.ws = this.options.protocols
        ? new WebSocket(wsUrl, this.options.protocols)
        : new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setState("OPEN");
        this.reconnectAttempts = 0;
        this.metrics.connectTime = Date.now();
        this.emit("open");
        this.flushQueue();
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.metrics.messagesReceived++;
        try {
          const data = JSON.parse(event.data);

          // Handle heartbeat pong
          if (data && data.type === "pong") {
            if (this.timeoutTimer) {
              clearTimeout(this.timeoutTimer);
              this.timeoutTimer = null;
            }
            return;
          }

          this.emit("message", data);
        } catch {
          // Send raw message if it's not JSON (for backwards compatibility/raw streams)
          this.emit("message", event.data);
        }
      };

      this.ws.onclose = (event) => {
        this.setState("CLOSED");
        this.emit("close", event.code, event.reason);
        this.handleDisconnect(event.code);
      };

      this.ws.onerror = (err) => {
        this.metrics.lastError = "WebSocket error occurred";
        this.emit("error", err);
      };
    } catch (err: any) {
      this.setState("CLOSED");
      this.metrics.lastError = err?.message || "Failed to initialize WebSocket";
      this.handleDisconnect();
    }
  }

  public disconnect() {
    this.manuallyClosed = true;
    this.cleanupTimers();
    this.detachOnlineListener();
    this.reconnectAttempts = 0;
    this.reconnectExhausted = false;
    this.setState("CLOSED");
    this.detachSocket(false);
  }

  /** Close the socket, keep the instance, and start over from attempt zero. */
  public reconnectNow() {
    this.disconnect();
    this.connect();
  }

  /**
   * Send a message. Objects are JSON encoded; strings and binary are sent as is.
   * Returns true when the message was sent or queued, false when it was dropped.
   */
  public send(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.rawSend(data);
      return true;
    }
    if (this.options.queueOffline && !this.manuallyClosed) {
      this.queue.push(data);
      while (this.queue.length > this.options.maxQueueSize) {
        this.queue.shift();
      }
      return true;
    }
    console.warn("ManagedWebSocket: Cannot send message, socket is not open");
    return false;
  }

  public clearQueue() {
    this.queue = [];
  }

  private rawSend(data: any) {
    this.ws!.send(isRawPayload(data) ? data : JSON.stringify(data));
    this.metrics.messagesSent++;
  }

  private flushQueue() {
    while (
      this.queue.length > 0 &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      this.rawSend(this.queue.shift());
    }
  }

  public on<K extends keyof WSEventMap>(event: K, callback: WSEventMap[K]) {
    if (!this.listeners[event]) {
      this.listeners[event] = [] as any;
    }
    this.listeners[event]!.push(callback as any);
  }

  public off<K extends keyof WSEventMap>(event: K, callback: WSEventMap[K]) {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = (list as any[]).filter(
      (cb) => cb !== callback,
    ) as any;
  }

  private emit<K extends keyof WSEventMap>(
    event: K,
    ...args: Parameters<WSEventMap[K]>
  ) {
    const list = this.listeners[event];
    if (list) {
      list.forEach((cb: any) => {
        try {
          cb(...args);
        } catch (e) {
          console.error(`Error in WebSocket event listener for ${event}:`, e);
        }
      });
    }
  }

  private setState(newState: ManagedWebSocketState) {
    this.state = newState;
    this.emit("stateChange", newState);
  }

  private detachSocket(closeOnlyIfActive: boolean) {
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
    if (
      !closeOnlyIfActive ||
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      this.ws.close();
    }
    this.ws = null;
  }

  private handleDisconnect(closeCode?: number) {
    this.cleanupTimers();

    if (this.manuallyClosed || !this.options.reconnect) return;
    if (closeCode === 1000 && !this.options.reconnectOnCleanClose) return;

    if (this.reconnectAttempts >= this.options.maxRetries) {
      this.reconnectExhausted = true;
      this.metrics.lastError = `Max retries (${this.options.maxRetries}) exceeded`;
      this.setState("CLOSED");
      return;
    }

    const delay = this.getNextDelay();
    this.reconnectAttempts++;
    this.metrics.reconnectionCount++;
    this.setState("RECONNECTING");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private getNextDelay(): number {
    const { baseReconnectDelay, backoffMultiplier, maxReconnectDelay } =
      this.options;
    const tempDelay =
      baseReconnectDelay * Math.pow(backoffMultiplier, this.reconnectAttempts);
    const delay = Math.min(maxReconnectDelay, tempDelay);
    // Exponential backoff with Full Jitter
    return this.options.jitter === "full" ? Math.random() * delay : delay;
  }

  private handleOnline = () => {
    if (this.manuallyClosed || !this.options.reconnectOnOnline) return;
    if (this.state === "CLOSED" || this.state === "RECONNECTING") {
      this.reconnectAttempts = 0;
      this.reconnectExhausted = false;
      this.connect();
    }
  };

  private attachOnlineListener() {
    if (
      this.onlineListenerAttached ||
      typeof window === "undefined" ||
      !this.options.reconnectOnOnline
    ) {
      return;
    }
    window.addEventListener("online", this.handleOnline);
    this.onlineListenerAttached = true;
  }

  private detachOnlineListener() {
    if (!this.onlineListenerAttached || typeof window === "undefined") return;
    window.removeEventListener("online", this.handleOnline);
    this.onlineListenerAttached = false;
  }

  private startHeartbeat() {
    if (!this.options.heartbeat) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.state === "OPEN") {
        this.rawSend(this.options.pingMessage);

        // Timeout detection
        if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
        this.timeoutTimer = setTimeout(() => {
          console.warn(
            "ManagedWebSocket: Heartbeat timeout, closing connection",
          );
          this.metrics.lastError = "Heartbeat timeout";
          if (this.ws) {
            this.ws.close();
          }
        }, this.options.heartbeatTimeout);
      }
    }, this.options.heartbeatInterval);
  }

  private cleanupTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public getMetrics() {
    const uptime =
      this.state === "OPEN" && this.metrics.connectTime > 0
        ? Math.floor((Date.now() - this.metrics.connectTime) / 1000)
        : 0;

    return {
      ...this.metrics,
      uptime,
      state: this.state,
    };
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private connections = new Map<string, ManagedWebSocket>();

  private constructor() {}

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Connections are shared by URL. `options` only apply when the connection is
   * created; later callers get the existing instance.
   */
  public getOrCreateConnection(
    url: string,
    token?: string | null,
    options?: ManagedWebSocketOptions,
  ): ManagedWebSocket {
    let conn = this.connections.get(url);
    if (!conn) {
      conn = new ManagedWebSocket(url, token, options);
      this.connections.set(url, conn);
    } else if (token !== undefined) {
      conn.updateToken(token);
    }
    return conn;
  }
}
