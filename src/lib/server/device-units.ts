// src/lib/server/device-units.ts
import { db } from './db';

function run(sql: string, params: any[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function getOne<T>(sql: string, params: any[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function getAll<T>(sql: string, params: any[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

export async function getDeviceUnit(deviceId: string): Promise<string | null> {
  const row = await getOne<{ unit: string }>(
    'SELECT unit FROM device_units WHERE device_id = ?',
    [deviceId]
  );
  return row?.unit ?? null;
}

export async function listDeviceUnits(): Promise<Map<string, string>> {
  const rows = await getAll<{ device_id: string; unit: string }>('SELECT device_id, unit FROM device_units');
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.device_id, r.unit);
  return map;
}

export async function setDeviceUnit(deviceId: string, unit: string) {
  await run(
    'INSERT INTO device_units (device_id, unit) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET unit = excluded.unit',
    [deviceId, unit]
  );
}
