// src/lib/client/sse.ts
import type { MLinkSseEvent } from '$lib/types';

export function connectSse(
  url: string,
  onEvent: (evt: MLinkSseEvent) => void,
  onStatus?: (status: 'open' | 'error') => void
) {
  const es = new EventSource(url);

  es.onopen = () => onStatus?.('open');
  es.onerror = () => onStatus?.('error');

  const handler = (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data) as MLinkSseEvent;
      onEvent(payload);
    } catch (err) {
      console.error('SSE 解析失敗', err);
    }
  };

  // 我們目前 server 送的是 event: telemetry
  es.addEventListener('telemetry', handler);
  // 之後如果你送 event: online，也會自動接得住
  es.addEventListener('online', handler);

  return () => es.close();
}
