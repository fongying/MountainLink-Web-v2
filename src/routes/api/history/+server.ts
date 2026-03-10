import { json } from '@sveltejs/kit';
import { listDeviceHistory } from '$lib/server/device-telemetry';

export const GET = async ({ url, locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const deviceId = url.searchParams.get('deviceId')?.trim();
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit') ?? '120')));

  if (!deviceId) return new Response('deviceId required', { status: 400 });

  const rows = await listDeviceHistory(deviceId, limit);
  rows.reverse();

  return json({ deviceId, rows });
};

