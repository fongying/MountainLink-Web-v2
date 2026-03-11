import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceUnits } from '$lib/server/device-units';
import { getUnifiedHazardSnapshot } from '$lib/server/hazards';
import { ensureHazardMonitorLoop } from '$lib/server/hazard-monitor';
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
      const sendRaw = (chunk: string) => controller.enqueue(encoder.encode(chunk));
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
          sseClient.send('hazard_update', snapshot);
        } catch {
          // Ignore initial snapshot failure.
        }
      })();

      const onlineTimer = setInterval(async () => {
        try {
          const devices = await listDeviceStates();
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

      const heartbeat = setInterval(() => {
        sseClient.comment('ping');
      }, 15_000);

      const cleanup = () => {
        clearInterval(onlineTimer);
        clearInterval(heartbeat);
        unregisterSseClient(sseClient.id);
        try {
          controller.close();
        } catch {
          // Ignore close error.
        }
      };

      request.signal.addEventListener('abort', cleanup, { once: true });
    }
  });

  return new Response(stream, { headers });
};
