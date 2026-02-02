// src/lib/server/device-bindings.ts
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

export async function getDeviceBinding(deviceId: string): Promise<number | null> {
  const row = await getOne<{ user_id: number }>(
    'SELECT user_id FROM device_bindings WHERE device_id = ?',
    [deviceId]
  );
  return row?.user_id ?? null;
}

export async function setDeviceBinding(deviceId: string, userId: number | null) {
  if (userId == null) {
    await run('DELETE FROM device_bindings WHERE device_id = ?', [deviceId]);
    return;
  }

  await run(
    'INSERT INTO device_bindings (device_id, user_id) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET user_id = excluded.user_id',
    [deviceId, userId]
  );
}
