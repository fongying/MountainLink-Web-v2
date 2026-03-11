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

export async function getDeviceLabel(deviceId: string): Promise<string | null> {
  const row = await getOne<{ display_name: string }>(
    'SELECT display_name FROM device_labels WHERE device_id = ?',
    [deviceId]
  );
  return row?.display_name ?? null;
}

export async function listDeviceLabels(): Promise<Map<string, string>> {
  const rows = await getAll<{ device_id: string; display_name: string }>(
    'SELECT device_id, display_name FROM device_labels'
  );
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.device_id, row.display_name);
  return map;
}

export async function setDeviceLabel(deviceId: string, displayName: string | null) {
  const normalized = displayName?.trim() ?? '';

  if (!normalized) {
    await run('DELETE FROM device_labels WHERE device_id = ?', [deviceId]);
    return;
  }

  await run(
    `INSERT INTO device_labels (device_id, display_name)
     VALUES (?, ?)
     ON CONFLICT(device_id) DO UPDATE SET display_name = excluded.display_name`,
    [deviceId, normalized]
  );
}
