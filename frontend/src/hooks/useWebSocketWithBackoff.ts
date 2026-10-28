/**
 * @deprecated Use `useWebSocket` from "./useWebSocket".
 * Thin wrapper that keeps the old option names and the status-string return
 * shape on top of the shared ManagedWebSocket engine.
 *
 * @file useWebSocketWithBackoff.ts
 * @location frontend/src/hooks/useWebSocketWithBackoff.ts
 */

import { useCallback, useMemo, useState } from "react";
import { useWebSocket } from "./useWebSocket";

export interface WebSocketOptions {
  url: string;
  initialBackoff?: number; // default: 1000ms
  maxBackoff?: number; // default: 30000ms
  maxRetries?: number; // default: 10
  backoffMultiplier?: number; // default: 2
  reconnectOnClose?: boolean; // default: true
  /** Ignored: browsers always fire a close event after an error, which already reconnects. */
  reconnectOnError?: boolean;
  protocols?: string | string[];
}

export interface WebSocketState {
  status:
    "connecting" | "connected" | "disconnected" | "reconnecting" | "failed";
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  retryCount: number;
  lastError: string | null;
  lastMessage: any;
  readyState: number;
}

export interface WebSocketActions {
  send: (data: string | ArrayBuffer | Blob) => void;
  reconnect: () => void;
  disconnect: () => void;
  resetBackoff: () => void;
}

export function useWebSocketWithBackoff(
  options: WebSocketOptions,
): WebSocketState & WebSocketActions {
  const {
    url,
    initialBackoff = 1000,
    maxBackoff = 30000,
    maxRetries = 10,
    backoffMultiplier = 2,
    reconnectOnClose = true,
    protocols,
  } = options;

  const ws = useWebSocket({
    url,
    protocols,
    baseReconnectDelay: initialBackoff,
    maxReconnectDelay: maxBackoff,
    maxRetries,
    backoffMultiplier,
    reconnect: reconnectOnClose,
    // Same schedule as before: no jitter, no ping, and a clean close is final.
    jitter: "none",
    heartbeat: false,
    reconnectOnCleanClose: false,
  });

  const { send: wsSend, reconnect: wsReconnect, disconnect: wsDisconnect } = ws;

  // The old hook reported "disconnected" after disconnect() or a clean close.
  const [manuallyDisconnected, setManuallyDisconnected] = useState(false);

  const status: WebSocketState["status"] = useMemo(() => {
    switch (ws.state) {
      case "OPEN":
        return "connected";
      case "CONNECTING":
        return "connecting";
      case "RECONNECTING":
        return "reconnecting";
      default:
        return ws.reconnectExhausted && !manuallyDisconnected
          ? "failed"
          : "disconnected";
    }
  }, [ws.state, ws.reconnectExhausted, manuallyDisconnected]);

  const readyState =
    typeof WebSocket === "undefined"
      ? 0
      : ws.state === "OPEN"
        ? WebSocket.OPEN
        : ws.state === "CONNECTING" || ws.state === "RECONNECTING"
          ? WebSocket.CONNECTING
          : WebSocket.CLOSED;

  const send = useCallback(
    (data: string | ArrayBuffer | Blob) => {
      wsSend(data);
    },
    [wsSend],
  );

  const reconnect = useCallback(() => {
    setManuallyDisconnected(false);
    wsReconnect();
  }, [wsReconnect]);

  const disconnect = useCallback(() => {
    setManuallyDisconnected(true);
    wsDisconnect();
  }, [wsDisconnect]);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting" || status === "reconnecting",
    isReconnecting: status === "reconnecting",
    retryCount: ws.retryCount,
    lastError: ws.lastError,
    lastMessage: ws.lastMessage,
    readyState,
    send,
    reconnect,
    disconnect,
    resetBackoff: ws.resetBackoff,
  };
}

export default useWebSocketWithBackoff;
