import { getMockDevices } from '$lib/server/mock';
import { listDeviceUnits } from '$lib/server/device-units';
import { getUnifiedHazardSnapshot, shouldRefreshUnifiedHazards } from '$lib/server/hazards';
import {
  broadcastSse,
  getSseClientCount,
  registerSseClient,
  unregisterSseClient
} from '$lib/server/stream';

let hazardRefreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshingHazards = false;

function ensureHazardRefreshLoop() {
  if (hazardRefreshTimer) return;

  hazardRefreshTimer = setInterval(async () => {
    if (refreshingHazards || getSseClientCount() === 0) return;
    if (!shouldRefreshUnifiedHazards()) return;
    refreshingHazards = true;
    try {
      const { snapshot, changed } = await getUnifiedHazardSnapshot({
        force: false,
        reason: 'hazard_refresh'
      });
      if (changed) {
        broadcastSse('hazard_update', snapshot);
      }
    } catch {
      // ignore refresh errors in background loop
    } finally {
      refreshingHazards = false;
    }
  }, 60_000);
}

export const GET = async ({ request, locals }: any) => {
  if (!locals?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const deviceIdFilter = url.searchParams.get('deviceId')?.trim() || null;

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  };

  const units = await listDeviceUnits();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const sendRaw = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const sseClient = registerSseClient(sendRaw);

      ensureHazardRefreshLoop();

      sseClient.comment('connected');
      sseClient.send('hello', { connectedAt: new Date().toISOString() });

      void (async () => {
        try {
          const { snapshot } = await getUnifiedHazardSnapshot({ reason: 'stream_connect' });
          sseClient.send('hazard_update', snapshot);
        } catch {
          // ignore initial snapshot errors
        }
      })();

      let devices = getMockDevices().map((d) => ({
        ...d,
        unit: units.get(d.deviceId)
      }));

      const timer = setInterval(() => {
        const now = Date.now();

        devices = devices.map((d) => {
          if (!d.online) return d;

          const hr = d.hr != null ? Math.max(45, Math.min(180, d.hr + (Math.random() > 0.5 ? 2 : -2))) : undefined;
          const battery = Math.max(0, d.battery - (Math.random() > 0.85 ? 1 : 0));
          const lat = d.lat != null ? d.lat + (Math.random() - 0.5) * 0.00005 : undefined;
          const lon = d.lon != null ? d.lon + (Math.random() - 0.5) * 0.00005 : undefined;
          const sos = Math.random() > 0.98 ? !d.sos : d.sos;

          return { ...d, hr, battery, lat, lon, sos, updatedAt: now, unit: units.get(d.deviceId) };
        });

        const filtered = deviceIdFilter
          ? devices.filter((d) => d.deviceId === deviceIdFilter)
          : devices;

        sseClient.send('telemetry', { type: 'telemetry', devices: filtered });
      }, 1000);

      const heartbeat = setInterval(() => {
        sseClient.comment('ping');
      }, 15000);

      const cleanup = () => {
        clearInterval(timer);
        clearInterval(heartbeat);
        unregisterSseClient(sseClient.id);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      request.signal.addEventListener('abort', cleanup, { once: true });
    }
  });

  return new Response(stream, { headers });
};
