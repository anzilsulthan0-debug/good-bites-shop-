import {useEffect, useRef, useState} from 'react';
import {getStoredToken} from '../lib/api';

export type SyncStatus = 'on' | 'wait' | 'off';

interface SyncMessage {
  type: 'connected' | 'sync';
  scope?: 'shops' | 'receipts' | 'accounts' | 'all';
  shopId?: string | null;
  ts?: number;
}

export function useLiveSync(
  enabled: boolean,
  onSyncEvent: (msg: SyncMessage) => void,
) {
  const [status, setStatus] = useState<SyncStatus>(enabled ? 'wait' : 'off');
  const callbackRef = useRef(onSyncEvent);
  callbackRef.current = onSyncEvent;

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      if (!navigator.onLine) {
        setStatus('off');
        return;
      }

      setStatus('wait');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getStoredToken();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const url = `${proto}//${window.location.host}/ws${qs}`;

      try {
        ws = new WebSocket(url);
      } catch {
        setStatus('off');
        return;
      }

      ws.onopen = () => {
        if (!disposed) setStatus('on');
      };

      ws.onmessage = ev => {
        try {
          const msg = JSON.parse(String(ev.data)) as SyncMessage;
          if (msg.type === 'sync') {
            callbackRef.current(msg);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus(navigator.onLine ? 'wait' : 'off');
        reconnectTimer = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current({type: 'sync', scope: 'all'});
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connect();
        }
      }
    };

    const handleOnline = () => {
      callbackRef.current({type: 'sync', scope: 'all'});
      connect();
    };

    const handleOffline = () => {
      setStatus('off');
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      ws?.close();
    };
  }, [enabled]);

  return status;
}
