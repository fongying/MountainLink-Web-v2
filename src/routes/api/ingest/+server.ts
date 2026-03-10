import { json } from '@sveltejs/kit';
import { broadcastSse } from '$lib/server/stream';
import { ingestTelemetryPayload, isIngestAuthorized } from '$lib/server/device-telemetry';

export const POST = async ({ request, locals }: any) => {
  if (!isIngestAuthorized(request, Boolean(locals?.user))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();
  const devices = await ingestTelemetryPayload(body);

  if (devices.length > 0) {
    broadcastSse('telemetry', {
      type: 'telemetry',
      devices
    });
  }

  return json({
    ok: true,
    count: devices.length,
    devices: devices.map((device) => device.deviceId)
  });
};

