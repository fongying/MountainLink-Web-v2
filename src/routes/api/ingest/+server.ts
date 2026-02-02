// src/routes/api/ingest/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

type TelemetryIn = {
  deviceId: string;
  ts: number;
  hr?: number;
  battery?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  sos?: boolean;
  rssi?: number;
  snr?: number;
};

function run(sql: string, params: any[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

export const POST = async ({ request, locals }: any) => {
  // ✅ 先限制需登入（之後你可以改成 API key）
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const body = (await request.json()) as TelemetryIn | TelemetryIn[];
  const items = Array.isArray(body) ? body : [body];

  const sql = `INSERT INTO telemetry_history
    (device_id, ts, hr, battery, lat, lon, alt, sos, rssi, snr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const t of items) {
    await run(sql, [
      t.deviceId,
      t.ts,
      t.hr ?? null,
      t.battery ?? null,
      t.lat ?? null,
      t.lon ?? null,
      t.alt ?? null,
      t.sos ? 1 : 0,
      t.rssi ?? null,
      t.snr ?? null
    ]);
  }

  return json({ ok: true, count: items.length });
};
