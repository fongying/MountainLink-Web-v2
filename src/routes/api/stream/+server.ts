import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceUnits } from '$lib/server/device-units';
import { getUnifiedHazardSnapshot } from '$lib/server/hazards';
import { ensureHazardMonitorLoop } from '$lib/server/hazard-monitor';
import { getLatestAiRecommendation } from '$lib/server/ai-agent';
import { registerSseClient, unregisterSseClient } from '$lib/server/stream';

export const GET = async ({ request, locals }: any) => {
  if (!locals?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const deviceIdFilter = url.searchParams.get('deviceId')?.trim() || null;
  const labels = await listDeviceLabels();
  const units = await listDeviceUnits();

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let onlineTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (onlineTimer) clearInterval(onlineTimer);
        if (heartbeat) clearInterval(heartbeat);
        unregisterSseClient(sseClient.id);
        try {
          controller.close();
        } catch {
          // The browser may have already closed the stream.
        }
      };

      const sendRaw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const sseClient = registerSseClient(sendRaw);
      const onlineState = new Map<string, boolean>();

      ensureHazardMonitorLoop();

      sseClient.comment('connected');
      sseClient.send('hello', { connectedAt: new Date().toISOString() });

      const sendTelemetrySnapshot = async () => {
        const devices = (await listDeviceStates()).map((device) => ({
          ...device,
          displayName: labels.get(device.deviceId) ?? device.displayName,
          unit: units.get(device.deviceId) ?? device.unit
        }));
        if (closed) return;
        const filtered = deviceIdFilter
          ? devices.filter((device) => device.deviceId === deviceIdFilter)
          : devices;

        for (const device of filtered) {
          onlineState.set(device.deviceId, Boolean(device.online));
        }

        sseClient.send('telemetry', {
          type: 'telemetry',
          devices: filtered
        });
      };

      void sendTelemetrySnapshot();

      void (async () => {
        try {
          const { snapshot } = await getUnifiedHazardSnapshot({ reason: 'stream_connect' });
          if (closed) return;
          sseClient.send('hazard_update', snapshot);
        } catch {
          // Ignore initial snapshot failure.
        }
      })();

      void (async () => {
        try {
          const recommendation = await getLatestAiRecommendation();
          if (closed || !recommendation) return;
          sseClient.send('ai_recommendation_update', recommendation);
        } catch {
          // Ignore initial AI recommendation load failure.
        }
      })();

      onlineTimer = setInterval(async () => {
        try {
          const devices = await listDeviceStates();
          if (closed) return;
          const filtered = deviceIdFilter
            ? devices.filter((device) => device.deviceId === deviceIdFilter)
            : devices;

          for (const device of filtered) {
            const prev = onlineState.get(device.deviceId);
            if (prev == null) {
              onlineState.set(device.deviceId, Boolean(device.online));
              continue;
            }

            if (prev !== Boolean(device.online)) {
              onlineState.set(device.deviceId, Boolean(device.online));
              sseClient.send('online', {
                type: 'online',
                deviceId: device.deviceId,
                online: Boolean(device.online),
                updatedAt: Date.now()
              });
            }
          }
        } catch {
          // Ignore transient online polling failure.
        }
      }, 30_000);

      heartbeat = setInterval(() => {
        sseClient.comment('ping');
      }, 15_000);

      request.signal.addEventListener('abort', cleanup, { once: true });
    },
    cancel() {
      // Request abort handles cleanup for normal browser disconnects.
    }
  });

  return new Response(stream, { headers });
};
