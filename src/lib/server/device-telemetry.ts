import { env } from '$env/dynamic/private';
import type { DeviceTelemetry } from '$lib/types';
import { db } from '$lib/server/db';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type DeviceStateRow = {
  device_id: string;
  updated_at: number;
  recv_ts: string | null;
  packet_id: number | null;
  sender: string | null;
  from_node: number | null;
  channel: number | null;
  hops_away: number | null;
  hop_start: number | null;
  hr: number | null;
  battery: number | null;
  charging: number | null;
  spo2: number | null;
  bp_hi: number | null;
  bp_lo: number | null;
  bt: number | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
  sos: number | null;
  rssi: number | null;
  snr: number | null;
  raw_text: string | null;
  raw_json: string | null;
};

type TelemetryHistoryRow = {
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
  spo2: number | null;
  bpHi: number | null;
  bpLo: number | null;
  bt: number | null;
};

const DEMO_DEVICE_IDS = ['NT-DEMO-001', 'NT-DEMO-002'] as const;

type LegacyTelemetryIn = {
  deviceId?: string;
  ts?: number;
  hr?: number;
  battery?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  sos?: boolean | number;
  rssi?: number;
  snr?: number;
  spo2?: number;
  bpHi?: number;
  bpLo?: number;
  bt?: number;
};

type NodeRedTelemetryIn = {
  v?: number;
  recv_ts?: string;
  packet_id?: number;
  sender?: string;
  from?: number;
  channel?: number;
  hops_away?: number;
  hop_start?: number;
  rssi?: number;
  snr?: number;
  device_id?: string;
  hr?: number;
  sos?: boolean | number;
  battery?: number;
  spo2?: number;
  bp_hi?: number;
  bp_lo?: number;
  bt?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  raw_text?: string;
};

type NormalizedTelemetry = {
  deviceId: string;
  ts: number;
  recvTs?: string;
  packetId?: number;
  sender?: string;
  fromNode?: number;
  channel?: number;
  hopsAway?: number;
  hopStart?: number;
  hr?: number;
  battery?: number;
  charging: boolean;
  spo2?: number;
  bpHi?: number;
  bpLo?: number;
  bt?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  sos?: boolean;
  rssi?: number;
  snr?: number;
  rawText?: string;
  rawJson: string;
};

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as any, (err) => (err ? reject(err) : resolve()));
  });
}

function runWithChanges(sql: string, params: unknown[] = []) {
  return new Promise<number>((resolve, reject) => {
    db.run(sql, params as any, function (err) {
      if (err) return reject(err);
      resolve(this?.changes ?? 0);
    });
  });
}

function getOne<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params as any, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function getAll<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params as any, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  }
  return undefined;
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function rowToDeviceTelemetry(row: DeviceStateRow, now = Date.now()): DeviceTelemetry {
  return {
    deviceId: row.device_id,
    online: now - row.updated_at <= ONLINE_WINDOW_MS,
    battery: row.battery ?? 0,
    charging: Boolean(row.charging),
    hr: row.hr ?? undefined,
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    alt: row.alt ?? undefined,
    updatedAt: row.updated_at,
    sos: row.sos != null ? Boolean(row.sos) : undefined,
    rssi: row.rssi ?? undefined,
    snr: row.snr ?? undefined,
    spo2: row.spo2 ?? undefined,
    bpHi: row.bp_hi ?? undefined,
    bpLo: row.bp_lo ?? undefined,
    bt: row.bt ?? undefined,
    packetId: row.packet_id ?? undefined,
    sender: row.sender ?? undefined,
    channel: row.channel ?? undefined,
    hopsAway: row.hops_away ?? undefined,
    hopStart: row.hop_start ?? undefined
  };
}

function demoDevices(now = Date.now()): DeviceTelemetry[] {
  return [
    {
      deviceId: DEMO_DEVICE_IDS[0],
      displayName: '奇萊北峰示範隊',
      online: true,
      battery: 87,
      charging: false,
      hr: 82,
      spo2: 97,
      bpHi: 118,
      bpLo: 76,
      bt: 36.7,
      lat: 23.9518,
      lon: 121.0922,
      alt: 2145,
      updatedAt: now - 20_000,
      sos: false,
      rssi: -84,
      snr: 8.5,
      unit: '登山者'
    },
    {
      deviceId: DEMO_DEVICE_IDS[1],
      displayName: '合歡山 SOS 示範隊',
      online: true,
      battery: 63,
      charging: false,
      hr: 118,
      spo2: 92,
      bpHi: 132,
      bpLo: 88,
      bt: 37.4,
      lat: 23.9476,
      lon: 121.1064,
      alt: 2260,
      updatedAt: now - 15_000,
      sos: true,
      rssi: -97,
      snr: 3.2,
      unit: '待救者'
    }
  ];
}
function normalizeTelemetry(input: LegacyTelemetryIn | NodeRedTelemetryIn): NormalizedTelemetry {
  const nodeRed = input as NodeRedTelemetryIn;
  const legacy = input as LegacyTelemetryIn;

  const deviceId = String(nodeRed.device_id ?? legacy.deviceId ?? '').trim();
  if (!deviceId) throw new Error('device_id is required');

  const ts = toEpochMs(nodeRed.recv_ts) ?? toEpochMs(legacy.ts) ?? Date.now();
  const battery = toFiniteNumber(nodeRed.battery ?? legacy.battery);

  return {
    deviceId,
    ts,
    recvTs: typeof nodeRed.recv_ts === 'string' ? nodeRed.recv_ts : undefined,
    packetId: toFiniteNumber(nodeRed.packet_id),
    sender: typeof nodeRed.sender === 'string' ? nodeRed.sender.trim() || undefined : undefined,
    fromNode: toFiniteNumber(nodeRed.from),
    channel: toFiniteNumber(nodeRed.channel),
    hopsAway: toFiniteNumber(nodeRed.hops_away),
    hopStart: toFiniteNumber(nodeRed.hop_start),
    hr: toFiniteNumber(nodeRed.hr ?? legacy.hr),
    battery,
    charging: (battery ?? 0) > 100,
    spo2: toFiniteNumber(nodeRed.spo2 ?? legacy.spo2),
    bpHi: toFiniteNumber(nodeRed.bp_hi ?? legacy.bpHi),
    bpLo: toFiniteNumber(nodeRed.bp_lo ?? legacy.bpLo),
    bt: toFiniteNumber(nodeRed.bt ?? legacy.bt),
    lat: toFiniteNumber(nodeRed.lat ?? legacy.lat),
    lon: toFiniteNumber(nodeRed.lon ?? legacy.lon),
    alt: toFiniteNumber(nodeRed.alt ?? legacy.alt),
    sos: toBoolean(nodeRed.sos ?? legacy.sos),
    rssi: toFiniteNumber(nodeRed.rssi ?? legacy.rssi),
    snr: toFiniteNumber(nodeRed.snr ?? legacy.snr),
    rawText: typeof nodeRed.raw_text === 'string' ? nodeRed.raw_text : undefined,
    rawJson: JSON.stringify(input)
  };
}

async function upsertDeviceState(item: NormalizedTelemetry) {
  await run(
    `INSERT INTO device_state (
      device_id, updated_at, recv_ts, packet_id, sender, from_node, channel, hops_away, hop_start,
      hr, battery, charging, spo2, bp_hi, bp_lo, bt, lat, lon, alt, sos, rssi, snr,
      raw_text, raw_json, updated_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(device_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      recv_ts = excluded.recv_ts,
      packet_id = excluded.packet_id,
      sender = excluded.sender,
      from_node = excluded.from_node,
      channel = excluded.channel,
      hops_away = excluded.hops_away,
      hop_start = excluded.hop_start,
      hr = excluded.hr,
      battery = excluded.battery,
      charging = excluded.charging,
      spo2 = excluded.spo2,
      bp_hi = excluded.bp_hi,
      bp_lo = excluded.bp_lo,
      bt = excluded.bt,
      lat = excluded.lat,
      lon = excluded.lon,
      alt = excluded.alt,
      sos = excluded.sos,
      rssi = excluded.rssi,
      snr = excluded.snr,
      raw_text = excluded.raw_text,
      raw_json = excluded.raw_json,
      updated_at_iso = datetime('now')`,
    [
      item.deviceId,
      item.ts,
      item.recvTs ?? null,
      item.packetId ?? null,
      item.sender ?? null,
      item.fromNode ?? null,
      item.channel ?? null,
      item.hopsAway ?? null,
      item.hopStart ?? null,
      item.hr ?? null,
      item.battery ?? null,
      item.charging ? 1 : 0,
      item.spo2 ?? null,
      item.bpHi ?? null,
      item.bpLo ?? null,
      item.bt ?? null,
      item.lat ?? null,
      item.lon ?? null,
      item.alt ?? null,
      item.sos == null ? null : item.sos ? 1 : 0,
      item.rssi ?? null,
      item.snr ?? null,
      item.rawText ?? null,
      item.rawJson
    ]
  );
}

async function insertHistory(item: NormalizedTelemetry) {
  return runWithChanges(
    `INSERT OR IGNORE INTO telemetry_history (
      device_id, ts, hr, battery, lat, lon, alt, sos, rssi, snr, recv_ts, packet_id, sender,
      from_node, channel, hops_away, hop_start, spo2, bp_hi, bp_lo, bt, raw_text, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.deviceId,
      item.ts,
      item.hr ?? null,
      item.battery ?? null,
      item.lat ?? null,
      item.lon ?? null,
      item.alt ?? null,
      item.sos == null ? null : item.sos ? 1 : 0,
      item.rssi ?? null,
      item.snr ?? null,
      item.recvTs ?? null,
      item.packetId ?? null,
      item.sender ?? null,
      item.fromNode ?? null,
      item.channel ?? null,
      item.hopsAway ?? null,
      item.hopStart ?? null,
      item.spo2 ?? null,
      item.bpHi ?? null,
      item.bpLo ?? null,
      item.bt ?? null,
      item.rawText ?? null,
      item.rawJson
    ]
  );
}

export async function ingestTelemetryPayload(input: LegacyTelemetryIn | NodeRedTelemetryIn | Array<LegacyTelemetryIn | NodeRedTelemetryIn>) {
  const payloads = Array.isArray(input) ? input : [input];
  const accepted: DeviceTelemetry[] = [];

  for (const payload of payloads) {
    const normalized = normalizeTelemetry(payload);
    const inserted = await insertHistory(normalized);
    if (normalized.packetId != null && inserted === 0) continue;

    await upsertDeviceState(normalized);
    const state = await getDeviceState(normalized.deviceId);
    if (state) accepted.push(state);
  }

  return accepted;
}

export async function listDeviceStates() {
  const rows = await getAll<DeviceStateRow>(
    `SELECT device_id, updated_at, recv_ts, packet_id, sender, from_node, channel, hops_away, hop_start,
            hr, battery, charging, spo2, bp_hi, bp_lo, bt, lat, lon, alt, sos, rssi, snr, raw_text, raw_json
     FROM device_state
     ORDER BY updated_at DESC, device_id ASC`
  );
  const now = Date.now();
  const liveDevices = rows.map((row) => rowToDeviceTelemetry(row, now));
  const existingIds = new Set(liveDevices.map((device) => device.deviceId));
  const fallbackDevices = demoDevices(now).filter((device) => !existingIds.has(device.deviceId));
  return [...liveDevices, ...fallbackDevices].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

export async function getDeviceState(deviceId: string) {
  const row = await getOne<DeviceStateRow>(
    `SELECT device_id, updated_at, recv_ts, packet_id, sender, from_node, channel, hops_away, hop_start,
            hr, battery, charging, spo2, bp_hi, bp_lo, bt, lat, lon, alt, sos, rssi, snr, raw_text, raw_json
     FROM device_state
     WHERE device_id = ?`,
    [deviceId]
  );
  if (row) return rowToDeviceTelemetry(row);
  const fallback = demoDevices().find((device) => device.deviceId === deviceId);
  return fallback ?? null;
}

export async function listDeviceHistory(deviceId: string, limit: number) {
  return getAll<TelemetryHistoryRow>(
    `SELECT device_id as deviceId, ts, hr, battery, lat, lon, alt, sos, rssi, snr,
            spo2, bp_hi as bpHi, bp_lo as bpLo, bt
     FROM telemetry_history
     WHERE device_id = ?
     ORDER BY ts DESC
     LIMIT ?`,
    [deviceId, limit]
  );
}

export function isIngestAuthorized(request: Request, hasLoggedInUser: boolean) {
  const configuredKey = env.MLINK_INGEST_API_KEY?.trim() || '';
  if (!configuredKey) {
    return hasLoggedInUser;
  }

  const headerKey = request.headers.get('X-MLINK-INGEST-KEY')?.trim() || '';
  const authHeader = request.headers.get('Authorization')?.trim() || '';
  const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  return headerKey === configuredKey || bearerKey === configuredKey;
}

export function isDemoDevice(deviceId: string) {
  return DEMO_DEVICE_IDS.includes(deviceId as (typeof DEMO_DEVICE_IDS)[number]);
}
