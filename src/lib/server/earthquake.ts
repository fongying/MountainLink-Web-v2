import { createHash } from 'node:crypto';
import type { EarthquakeEvent, EqReport } from '$lib/types';
import { fetchCwaDatastore } from '$lib/server/cwa';
import { db } from '$lib/server/db';

const DATASET_ID = 'E-A0015-001';
const POLL_INTERVAL_MS = 90_000;
const EVENTS_WINDOW_MS = 72 * 60 * 60 * 1000;
const EVENTS_LIMIT = 3;
const RETENTION_DAYS = 7;

type RawResponse = {
  records?: {
    Earthquake?: RawEarthquake[];
  };
};

type RawEarthquake = {
  EarthquakeNo?: number | string;
  EarthquakeInfo?: {
    OriginTime?: string;
    FocalDepth?: number | string;
    Epicenter?: {
      Location?: string;
      EpicenterLatitude?: number | string;
      EpicenterLongitude?: number | string;
    };
    EarthquakeMagnitude?: {
      MagnitudeValue?: number | string;
    };
  };
};

type DbEventRow = {
  id: string;
  origin_time: string;
  magnitude: number | null;
  depth_km: number | null;
  lat: number | null;
  lon: number | null;
  location: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

type EarthquakeUpsertInput = {
  id?: string;
  originTime: string;
  magnitude?: number;
  depthKm?: number;
  lat?: number;
  lon?: number;
  location?: string;
  source?: string;
};

type TriggerWebhookLocation = {
  county?: string;
  town?: string;
};

export type TriggerWebhookPayload = {
  id?: string;
  eventId?: string;
  earthquakeNo?: string | number;
  originTime?: string | number;
  triggeredAt?: number;
  magnitude?: number;
  depthKm?: number;
  lat?: number;
  lon?: number;
  location?: string;
  source?: 'EQ_WAKEUP' | 'OTHER_APP' | string;
  site?: TriggerWebhookLocation;
  thresholdIntensity?: number;
  estimatedIntensity?: number;
  raw?: unknown;
};

let schemaReadyPromise: Promise<void> | null = null;
let pollingPromise: Promise<void> | null = null;
let lastPolledAt = 0;

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function runWithChanges(sql: string, params: unknown[] = []) {
  return new Promise<number>((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this?.changes ?? 0);
    });
  });
}

function getOne<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function getAll<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

function parseNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseOriginTime(v?: string): number | undefined {
  if (!v) return undefined;
  const raw = v.trim();
  if (!raw) return undefined;
  const hasZone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
  const normalized = hasZone ? raw : `${raw}+08:00`;
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : undefined;
}

function normalizeCountyName(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('台') ? `臺${trimmed.slice(1)}` : trimmed;
}

function toIsoTime(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string' && v.trim()) {
    const ts = Date.parse(v);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
    const withZone = Date.parse(`${v.trim()}+08:00`);
    if (Number.isFinite(withZone)) return new Date(withZone).toISOString();
  }
  return undefined;
}

function toFinite(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function deterministicId(parts: Array<string | number | undefined>) {
  const base = parts.map((p) => String(p ?? '')).join('|');
  return createHash('sha1').update(base).digest('hex');
}

function eventFromRow(row: DbEventRow): EarthquakeEvent {
  const originTs = Date.parse(row.origin_time);
  const createdTs = Date.parse(row.created_at);
  const magnitude = row.magnitude ?? undefined;
  const location = (row.location || '').trim();
  const magnitudeText =
    magnitude != null && Number.isFinite(magnitude) ? `M${magnitude.toFixed(1)}` : '地震通知';
  const depthText = row.depth_km != null ? `，深度 ${row.depth_km} km` : '';

  return {
    id: row.id,
    kind: 'EARTHQUAKE',
    hasReport: row.source === 'CWA',
    hasTrigger: row.source !== 'CWA',
    reportId: row.source === 'CWA' ? row.id : undefined,
    triggerIds: [],
    firstSeenAt: Number.isFinite(createdTs) ? createdTs : Date.now(),
    originTime: Number.isFinite(originTs) ? originTs : undefined,
    reportedAt: Number.isFinite(Date.parse(row.updated_at)) ? Date.parse(row.updated_at) : undefined,
    magnitude,
    depthKm: row.depth_km ?? undefined,
    epicenterLat: row.lat ?? undefined,
    epicenterLon: row.lon ?? undefined,
    epicenterText: location || undefined,
    maxIntensity: undefined,
    intensityByCounty: undefined,
    title: `${magnitudeText} ${location || '未知位置'}`,
    summary: `${location || '未知位置'}${depthText}` || '地震事件',
    severityScore: (magnitude ?? 0) * 100 + (row.source === 'CWA' ? 10 : 0),
    raw: undefined
  };
}

function triggerLocation(payload: TriggerWebhookPayload): string {
  if (typeof payload.location === 'string' && payload.location.trim()) {
    return payload.location.trim();
  }

  const county = normalizeCountyName(payload.site?.county || '');
  const town = (payload.site?.town || '').trim();
  return `${county}${town ? ` ${town}` : ''}`.trim();
}

function triggerEventId(payload: TriggerWebhookPayload, originTimeIso: string, location: string): string {
  if (payload.id) return String(payload.id);
  if (payload.eventId) return String(payload.eventId);
  if (payload.earthquakeNo != null) return String(payload.earthquakeNo);

  const originTs = Date.parse(originTimeIso);
  const bucket = Math.floor(originTs / 10_000);
  return deterministicId([
    'TRIGGER',
    payload.source || 'OTHER_APP',
    location,
    payload.thresholdIntensity,
    payload.estimatedIntensity,
    bucket
  ]);
}

export function parseEqReportEA0015001(raw: unknown, issuedAt = Date.now()): EqReport[] {
  const response = raw as RawResponse;
  const earthquakes = response.records?.Earthquake ?? [];
  const reports: EqReport[] = [];

  for (const eq of earthquakes) {
    const info = eq.EarthquakeInfo;
    const epicenter = info?.Epicenter;

    const originTime = parseOriginTime(info?.OriginTime);
    if (originTime == null) continue;

    const magnitude = parseNumber(info?.EarthquakeMagnitude?.MagnitudeValue);
    const depthKm = parseNumber(info?.FocalDepth);
    const lat = parseNumber(epicenter?.EpicenterLatitude);
    const lon = parseNumber(epicenter?.EpicenterLongitude);
    const locationText = (epicenter?.Location || '').trim();
    const earthquakeNo = parseNumber(eq.EarthquakeNo);

    const id =
      earthquakeNo != null
        ? String(Math.trunc(earthquakeNo))
        : deterministicId(['CWA', originTime, magnitude, lat, lon, locationText]);

    reports.push({
      id,
      source: 'CWA_REPORT',
      earthquakeNo: earthquakeNo != null ? Math.trunc(earthquakeNo) : 0,
      originTime,
      issuedAt,
      magnitude,
      depthKm,
      epicenter: {
        lat: lat ?? 0,
        lon: lon ?? 0,
        locationText
      },
      intensityByCounty: {},
      maxIntensity: undefined,
      reportContent: undefined,
      web: undefined,
      images: undefined,
      raw: eq
    });
  }

  return reports;
}

export async function ensureEarthquakeSchema(): Promise<void> {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await run(`CREATE TABLE IF NOT EXISTS earthquake_events (
      id TEXT PRIMARY KEY,
      origin_time TEXT NOT NULL,
      magnitude REAL,
      depth_km REAL,
      lat REAL,
      lon REAL,
      location TEXT,
      source TEXT NOT NULL DEFAULT 'CWA',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    await run(
      'CREATE INDEX IF NOT EXISTS idx_eq_origin_time ON earthquake_events(origin_time)'
    );
    await run(
      'CREATE INDEX IF NOT EXISTS idx_eq_created_at ON earthquake_events(created_at)'
    );
  })();

  return schemaReadyPromise;
}

async function getEventRowById(id: string) {
  return getOne<DbEventRow>('SELECT * FROM earthquake_events WHERE id = ?', [id]);
}

export async function upsertEarthquakeEvent(event: EarthquakeUpsertInput) {
  await ensureEarthquakeSchema();

  const normalizedOrigin = toIsoTime(event.originTime);
  if (!normalizedOrigin) throw new Error('Invalid origin_time');

  const autoId =
    event.id ||
    deterministicId([
      normalizedOrigin,
      event.magnitude,
      event.lat,
      event.lon,
      event.location || '',
      event.source || 'CWA'
    ]);
  const id = String(autoId);

  const existing = await getOne<{ id: string; created_at: string }>(
    'SELECT id, created_at FROM earthquake_events WHERE id = ?',
    [id]
  );

  const nowIso = new Date().toISOString();
  const createdAt = existing?.created_at || nowIso;
  const source = (event.source || 'CWA').trim() || 'CWA';

  await run(
    `INSERT INTO earthquake_events (
      id, origin_time, magnitude, depth_km, lat, lon, location, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      origin_time=excluded.origin_time,
      magnitude=excluded.magnitude,
      depth_km=excluded.depth_km,
      lat=excluded.lat,
      lon=excluded.lon,
      location=excluded.location,
      source=excluded.source,
      updated_at=excluded.updated_at`,
    [
      id,
      normalizedOrigin,
      event.magnitude ?? null,
      event.depthKm ?? null,
      event.lat ?? null,
      event.lon ?? null,
      event.location ?? null,
      source,
      createdAt,
      nowIso
    ]
  );

  return { id, isNew: !existing };
}

export async function getEarthquakeEvents(options?: { sinceISO?: string; limit?: number }) {
  await ensureEarthquakeSchema();

  const sinceISO = options?.sinceISO || new Date(Date.now() - EVENTS_WINDOW_MS).toISOString();
  const limit = Math.max(1, Math.min(EVENTS_LIMIT, Math.floor(options?.limit ?? EVENTS_LIMIT)));

  const rows = await getAll<DbEventRow>(
    `SELECT id, origin_time, magnitude, depth_km, lat, lon, location, source, created_at, updated_at
     FROM earthquake_events
     WHERE origin_time >= ?
     ORDER BY origin_time DESC
     LIMIT ?`,
    [sinceISO, limit]
  );

  return rows.map(eventFromRow);
}

export async function getLatestEarthquake() {
  const list = await getEarthquakeEvents({ limit: 1 });
  return list[0] ?? null;
}

export async function pruneOldEarthquakes(olderThanISO: string) {
  await ensureEarthquakeSchema();
  const deleted = await runWithChanges(
    'DELETE FROM earthquake_events WHERE origin_time < ?',
    [olderThanISO]
  );
  return deleted;
}

export async function pollEqReport(force = false): Promise<void> {
  await ensureEarthquakeSchema();

  const now = Date.now();
  if (!force && now - lastPolledAt < POLL_INTERVAL_MS) return;
  if (pollingPromise) {
    await pollingPromise;
    return;
  }

  pollingPromise = (async () => {
    const fetchedAt = Date.now();
    const raw = await fetchCwaDatastore<RawResponse>(DATASET_ID, { limit: '50' });
    const reports = parseEqReportEA0015001(raw, fetchedAt);

    for (const report of reports) {
      await upsertEarthquakeEvent({
        id: report.id,
        originTime: new Date(report.originTime).toISOString(),
        magnitude: report.magnitude,
        depthKm: report.depthKm,
        lat: report.epicenter.lat,
        lon: report.epicenter.lon,
        location: report.epicenter.locationText,
        source: 'CWA'
      });
    }

    await pruneOldEarthquakes(
      new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    );
    lastPolledAt = Date.now();
  })();

  try {
    await pollingPromise;
  } finally {
    pollingPromise = null;
  }
}

export async function receiveEqTrigger(payload: TriggerWebhookPayload) {
  await ensureEarthquakeSchema();
  try {
    await pollEqReport(false);
  } catch (error) {
    // Trigger path should stay available even if CWA polling fails temporarily.
    console.warn('[earthquake] pollEqReport failed before trigger upsert:', error);
  }

  const source =
    (payload.source || 'OTHER_APP').toUpperCase() === 'EQ_WAKEUP' ? 'EQ_WAKEUP' : 'OTHER_APP';

  const originTimeIso =
    toIsoTime(payload.originTime) || toIsoTime(payload.triggeredAt) || new Date().toISOString();
  const location = triggerLocation(payload) || '未知位置';

  const magnitude = toFinite(payload.magnitude);
  const depthKm = toFinite(payload.depthKm);
  const lat = toFinite(payload.lat);
  const lon = toFinite(payload.lon);

  const id = triggerEventId(payload, originTimeIso, location);

  const result = await upsertEarthquakeEvent({
    id,
    originTime: originTimeIso,
    magnitude,
    depthKm,
    lat,
    lon,
    location,
    source
  });

  await pruneOldEarthquakes(
    new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  );

  const row = await getEventRowById(result.id);
  return {
    id: result.id,
    isNew: result.isNew,
    event: row ? eventFromRow(row) : null
  };
}

export async function listEqEvents(): Promise<EarthquakeEvent[]> {
  await pollEqReport(false);
  return getEarthquakeEvents({
    sinceISO: new Date(Date.now() - EVENTS_WINDOW_MS).toISOString(),
    limit: EVENTS_LIMIT
  });
}

export async function getEqLatestEvent(): Promise<EarthquakeEvent | null> {
  await pollEqReport(false);
  return getLatestEarthquake();
}
