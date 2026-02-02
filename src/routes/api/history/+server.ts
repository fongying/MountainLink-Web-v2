// src/routes/api/history/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

type HistoryRow = {
  deviceId: string;
  ts: number;
  hr: number | null;
  battery: number | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
  sos: number | null;
  rssi: number | null;
  snr: number | null;
};

function all<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params as any, (err, rows) => {
      if (err) return reject(err);
      // ✅ sqlite3 的 rows 在型別上很鬆，這裡由我們 wrapper 統一做斷言
      resolve(rows as T[]);
    });
  });
}

export const GET = async ({ url, locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const deviceId = url.searchParams.get('deviceId')?.trim();
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit') ?? '120')));

  if (!deviceId) return new Response('deviceId required', { status: 400 });

  // cspell:disable-next-line
  const rows = await all<HistoryRow>(
    `SELECT device_id as deviceId, ts, hr, battery, lat, lon, alt, sos, rssi, snr
     FROM telemetry_history
     WHERE device_id = ?
     ORDER BY ts DESC
     LIMIT ?`,
    [deviceId, limit]
  );

  rows.reverse(); // 由舊到新

  return json({ deviceId, rows });
};
