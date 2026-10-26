/**
 * @deprecated Use `useWebSocket` from "./useWebSocket" with `shared: true`.
 * Kept so existing callers keep working: it shares one connection per URL and
 * retries without a limit.
 */
import { useWebSocket } from "./useWebSocket";

type UseWebSocketManagerOptions = {
  url: string;
  token?: string | null;
  onMessage?: (data: unknown) => void;
};

export function useWebSocketManager({
  url,
  token,
  onMessage,
}: UseWebSocketManagerOptions) {
  const {
    isConnected,
    state,
    lastMessage,
    error,
    send,
    connect,
    disconnect,
    getMetrics,
  } = useWebSocket({
    url,
    token,
    onMessage,
    shared: true,
    maxRetries: Infinity,
  });

  return {
    isConnected,
    state,
    lastMessage,
    error,
    send,
    connect,
    disconnect,
    getMetrics,
  };
}
