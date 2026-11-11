import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createMx2Store, Mx2Error } from '$lib/server/mx2-ingest';
import { getDeviceState } from '$lib/server/device-telemetry';
import { broadcastSse } from '$lib/server/stream';

let store: ReturnType<typeof createMx2Store> | undefined;
export const POST = async ({ request }: any) => {
  const expected = Buffer.from(env.MLINK_MX2_API_KEY?.trim() || '');
  const supplied = Buffer.from(request.headers.get('X-MLINK-MX2-KEY')?.trim() || '');
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return new Response('Unauthorized', { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 16384) return new Response('Too large', { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
    store ??= createMx2Store();
    const ack = await store.ingest(body);
    // A notification failure must never turn a committed receipt into a failed acknowledgement.
    if (ack.status === 'inserted' && body.data_source === 'real') {
      try {
        const device = await getDeviceState(body.node_id);
        if (device) broadcastSse('telemetry', { type: 'telemetry', devices: [device] });
      } catch { console.error('MX2 committed; state notification failed'); }
    }
    return json(ack);
  } catch (error) {
    if (error instanceof Mx2Error) return json({ error: error.message }, { status: error.status });
    console.error('MX2 ingest failed');
    return json({ error: 'ingest failed' }, { status: 500 });
  }
};
