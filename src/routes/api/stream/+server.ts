// src/routes/api/stream/+server.ts
import { getMockDevices } from '$lib/server/mock';
import { listDeviceUnits } from '$lib/server/device-units';

export const GET = async ({ request, locals }: any) => {
  // ✅ 需要登入才允許連 SSE（避免被外部直接打）
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

      const send = (payload: unknown, event?: string) => {
        const evt = event ? `event: ${event}\n` : '';
        controller.enqueue(encoder.encode(`${evt}data: ${JSON.stringify(payload)}\n\n`));
      };

      controller.enqueue(encoder.encode(`: connected\n\n`));

      let devices = getMockDevices().map((d) => ({
        ...d,
        unit: units.get(d.deviceId)
      }));

      const timer = setInterval(() => {
        const now = Date.now();

        // 先更新所有裝置狀態（mock）
        devices = devices.map((d) => {
          if (!d.online) return d;

          const hr = d.hr != null ? Math.max(45, Math.min(180, d.hr + (Math.random() > 0.5 ? 2 : -2))) : undefined;
          const battery = Math.max(0, d.battery - (Math.random() > 0.85 ? 1 : 0));
          const lat = d.lat != null ? d.lat + (Math.random() - 0.5) * 0.00005 : undefined;
          const lon = d.lon != null ? d.lon + (Math.random() - 0.5) * 0.00005 : undefined;
          const sos = Math.random() > 0.98 ? !d.sos : d.sos;

          return { ...d, hr, battery, lat, lon, sos, updatedAt: now, unit: units.get(d.deviceId) };
        });

        // ✅ 若有 deviceIdFilter，就只送那台；否則送全部
        const filtered = deviceIdFilter
          ? devices.filter((d) => d.deviceId === deviceIdFilter)
          : devices;

        send({ type: 'telemetry', devices: filtered }, 'telemetry');
      }, 1000);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      const cleanup = () => {
        clearInterval(timer);
        clearInterval(heartbeat);
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
