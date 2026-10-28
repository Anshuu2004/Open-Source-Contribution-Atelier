/**
 * The one WebSocket hook. It wraps ManagedWebSocket (lib/ws.ts), which owns
 * backoff, retry limits, heartbeat, online recovery and the offline queue.
 *
 * useWebSocketManager and useWebSocketWithBackoff are thin wrappers around this
 * hook and keep their old return shapes.
 */
import { useEffect, useRef, useCallback, useState } from "react";
import {
  ManagedWebSocket,
  ManagedWebSocketOptions,
  ManagedWebSocketState,
  WebSocketManager,
} from "../lib/ws";

export interface UseWebSocketOptions extends ManagedWebSocketOptions {
  url: string;
  token?: string | null;
  onMessage?: (data: unknown) => void;
  /** Do not open a socket while `token` is empty. Default false. */
  requireToken?: boolean;
  /** Set to false to keep the hook idle. Default true. */
  enabled?: boolean;
  /**
   * Share one connection per URL across hooks instead of owning a private one.
   * A shared connection is not closed when a component unmounts. Default false.
   */
  shared?: boolean;
  /** Alias for baseReconnectDelay. */
  reconnectInterval?: number;
  /** Alias for maxRetries. */
  maxReconnectAttempts?: number;
}

export interface UseWebSocketResult {
  isConnected: boolean;
  state: ManagedWebSocketState;
  /** True after maxRetries reconnects failed; callers should use a REST fallback. */
  reconnectExhausted: boolean;
  /** Reconnect attempts made in the current outage. */
  retryCount: number;
  lastMessage: unknown | null;
  error: Event | null;
  lastError: string | null;
  /** True when the message was sent or queued. */
  send: (data: unknown) => boolean;
  connect: () => void;
  disconnect: () => void;
  /** Disconnect and connect again, starting the backoff from zero. */
  reconnect: () => void;
  /** Retry now from attempt zero; does nothing while connected or connecting. */
  resetBackoff: () => void;
  getMetrics: () => ReturnType<ManagedWebSocket["getMetrics"]> | null;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const {
    url,
    token,
    onMessage,
    requireToken = false,
    enabled = true,
    shared = false,
    reconnectInterval,
    maxReconnectAttempts,
    protocols,
    reconnect: autoReconnect,
    reconnectOnCleanClose,
    reconnectOnOnline,
    maxRetries = maxReconnectAttempts ?? 10,
    baseReconnectDelay = reconnectInterval,
    maxReconnectDelay,
    backoffMultiplier,
    jitter,
    heartbeat,
    heartbeatInterval,
    heartbeatTimeout,
    pingMessage,
    queueOffline,
    maxQueueSize,
  } = options;

  const canConnect = enabled && !!url && !(requireToken && !token);

  const [state, setState] = useState<ManagedWebSocketState>(
    canConnect ? "CONNECTING" : "CLOSED",
  );
  const [reconnectExhausted, setReconnectExhausted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [error, setError] = useState<Event | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const connRef = useRef<ManagedWebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const protocolsKey = Array.isArray(protocols)
    ? protocols.join(",")
    : protocols;
  const pingKey = JSON.stringify(pingMessage ?? null);

  // Open (or look up) the connection whenever the endpoint or tuning changes.
  useEffect(() => {
    if (!canConnect) {
      connRef.current = null;
      setState("CLOSED");
      return;
    }

    const wsOptions: ManagedWebSocketOptions = {
      protocols,
      reconnect: autoReconnect,
      reconnectOnCleanClose,
      reconnectOnOnline,
      maxRetries,
      baseReconnectDelay,
      maxReconnectDelay,
      backoffMultiplier,
      jitter,
      heartbeat,
      heartbeatInterval,
      heartbeatTimeout,
      pingMessage,
      queueOffline,
      maxQueueSize,
    };

    const conn = shared
      ? WebSocketManager.getInstance().getOrCreateConnection(
          url,
          token ?? null,
          wsOptions,
        )
      : new ManagedWebSocket(url, token ?? null, wsOptions);
    connRef.current = conn;

    const sync = () => {
      setState(conn.state);
      setReconnectExhausted(conn.reconnectExhausted);
      setRetryCount(conn.retryCount);
      setLastError(conn.getMetrics().lastError);
    };

    const handleOpen = () => setError(null);
    const handleMessage = (data: unknown) => {
      setLastMessage(data);
      onMessageRef.current?.(data);
    };
    const handleError = (err: unknown) => {
      setError(err as Event);
      setLastError(conn.getMetrics().lastError);
    };

    conn.on("open", handleOpen);
    conn.on("message", handleMessage);
    conn.on("error", handleError);
    conn.on("stateChange", sync);

    sync();
    conn.connect();

    return () => {
      conn.off("open", handleOpen);
      conn.off("message", handleMessage);
      conn.off("error", handleError);
      conn.off("stateChange", sync);
      if (!shared) conn.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canConnect,
    url,
    shared,
    protocolsKey,
    autoReconnect,
    reconnectOnCleanClose,
    reconnectOnOnline,
    maxRetries,
    baseReconnectDelay,
    maxReconnectDelay,
    backoffMultiplier,
    jitter,
    heartbeat,
    heartbeatInterval,
    heartbeatTimeout,
    pingKey,
    queueOffline,
    maxQueueSize,
  ]);

  // A new token reconnects the same instance instead of rebuilding it.
  useEffect(() => {
    connRef.current?.updateToken(token ?? null);
  }, [token]);

  const send = useCallback(
    (data: unknown): boolean => connRef.current?.send(data) ?? false,
    [],
  );

  const connect = useCallback(() => {
    connRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    connRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    connRef.current?.reconnectNow();
  }, []);

  const resetBackoff = useCallback(() => {
    const conn = connRef.current;
    if (!conn) return;
    if (conn.state === "OPEN" || conn.state === "CONNECTING") return;
    conn.reconnectNow();
  }, []);

  const getMetrics = useCallback(
    () => connRef.current?.getMetrics() ?? null,
    [],
  );

  return {
    isConnected: state === "OPEN",
    state,
    reconnectExhausted,
    retryCount,
    lastMessage,
    error,
    lastError,
    send,
    connect,
    disconnect,
    reconnect,
    resetBackoff,
    getMetrics,
  };
}

export default useWebSocket;
