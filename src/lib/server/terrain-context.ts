import { env } from '$env/dynamic/private';
import type { DeviceTelemetry } from '$lib/types';
import { listDeviceHistory } from '$lib/server/device-telemetry';

type ElevationResult = {
  elevation?: number;
  resolution?: number;
};

export type TerrainSummary = {
  status: 'no_location' | 'not_moved' | 'insufficient_history' | 'not_configured' | 'queried' | 'failed';
  summary: string;
  movementMeters?: number;
  movementWindowMinutes: number;
  sampledAt: string;
};

const MOVEMENT_WINDOW_MS = 30 * 60 * 1000;
const MOVEMENT_THRESHOLD_METERS = 100;

function elevationApiKey() {
  return env.GOOGLE_ELEVATION_API_KEY?.trim() || env.GOOGLE_MAPS_API_KEY?.trim() || env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radius = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasPosition(device: DeviceTelemetry): device is DeviceTelemetry & { lat: number; lon: number } {
  return Number.isFinite(device.lat) && Number.isFinite(device.lon);
}

function offsetCoordinate(lat: number, lon: number, northMeters: number, eastMeters: number) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(toRad(lat));
  return {
    lat: lat + northMeters / metersPerDegreeLat,
    lon: lon + eastMeters / metersPerDegreeLon
  };
}

function samplingPoints(lat: number, lon: number) {
  const offsets = [
    [0, 0],
    [200, 0],
    [-200, 0],
    [0, 200],
    [0, -200],
    [350, 350],
    [350, -350],
    [-350, 350],
    [-350, -350],
    [500, 0],
    [-500, 0],
    [0, 500],
    [0, -500]
  ] as const;
  return offsets.map(([north, east]) => offsetCoordinate(lat, lon, north, east));
}

async function fetchGoogleElevation(points: Array<{ lat: number; lon: number }>) {
  const key = elevationApiKey();
  if (!key) return null;

  const locations = points.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join('|');
  const url = new URL('https://maps.googleapis.com/maps/api/elevation/json');
  url.searchParams.set('locations', locations);
  url.searchParams.set('key', key);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Elevation HTTP ${response.status}`);
  const payload = (await response.json()) as { status?: string; error_message?: string; results?: ElevationResult[] };
  if (payload.status !== 'OK') throw new Error(payload.error_message || `Google Elevation ${payload.status || 'failed'}`);
  return payload.results ?? [];
}

function summarizeElevation(device: DeviceTelemetry, results: ElevationResult[], note?: string) {
  const elevations = results.map((item) => item.elevation).filter((value): value is number => Number.isFinite(value));
  if (elevations.length === 0) {
    const alt = device.alt != null ? `${Math.round(device.alt)}m` : '未知';
    return `${note ? `${note}；` : ''}Google Elevation 未回傳可用高程，沿用裝置海拔 ${alt}。`;
  }

  const center = elevations[0] ?? device.alt ?? 0;
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const relief = Math.round(max - min);
  const centerDiff = Math.round(max - center);
  const trend =
    relief >= 180
      ? '周邊高差大，行動需保守並留意陡坡與崩塌風險'
      : relief >= 80
        ? '周邊有明顯起伏，撤離或接近需確認路線'
        : '周邊高差較小，仍需結合天氣與地面狀況判斷';

  return `${note ? `${note}；` : ''}中心海拔約 ${Math.round(center)}m，周邊約 500m 內高差 ${relief}m，最高點較中心高約 ${centerDiff}m，${trend}。`;
}

async function movementInWindow(device: DeviceTelemetry) {
  if (!hasPosition(device)) return undefined;
  const history = await listDeviceHistory(device.deviceId, 80);
  const cutoff = Date.now() - MOVEMENT_WINDOW_MS;
  const current = { lat: device.lat, lon: device.lon };
  const candidates = history
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon) && row.ts >= cutoff && row.ts < device.updatedAt)
    .sort((a, b) => a.ts - b.ts);

  const baseline = candidates[0];
  if (!baseline || baseline.lat == null || baseline.lon == null) return undefined;
  return Math.round(distanceMeters({ lat: baseline.lat, lon: baseline.lon }, current));
}

async function queryTerrain(device: DeviceTelemetry, base: Pick<TerrainSummary, 'movementWindowMinutes' | 'sampledAt'>, movementMeters?: number, note?: string): Promise<TerrainSummary> {
  if (!elevationApiKey()) {
    const alt = device.alt != null ? `${Math.round(device.alt)}m` : '未知';
    return {
      ...base,
      status: 'not_configured',
      movementMeters,
      summary: `${note ? `${note}；` : ''}未設定 Google Elevation API key，沿用裝置海拔 ${alt}。`
    };
  }

  try {
    const results = await fetchGoogleElevation(samplingPoints(device.lat!, device.lon!));
    if (!results) {
      const alt = device.alt != null ? `${Math.round(device.alt)}m` : '未知';
      return {
        ...base,
        status: 'not_configured',
        movementMeters,
        summary: `${note ? `${note}；` : ''}未設定 Google Elevation API key，沿用裝置海拔 ${alt}。`
      };
    }
    return {
      ...base,
      status: 'queried',
      movementMeters,
      summary: summarizeElevation(device, results, note)
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      movementMeters,
      summary: `Google Elevation 查詢失敗：${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}

export async function buildTerrainSummary(device: DeviceTelemetry): Promise<TerrainSummary> {
  const sampledAt = new Date().toISOString();
  const base = {
    movementWindowMinutes: Math.round(MOVEMENT_WINDOW_MS / 60_000),
    sampledAt
  };

  if (!hasPosition(device)) {
    return {
      ...base,
      status: 'no_location',
      summary: '裝置沒有可用定位資料，無法查詢地形摘要。'
    };
  }

  const movementMeters = await movementInWindow(device);
  if (movementMeters == null) {
    return queryTerrain(device, base, undefined, '歷史定位不足，改以目前座標查詢 Google Elevation');
  }

  if (movementMeters < MOVEMENT_THRESHOLD_METERS) {
    const alt = device.alt != null ? `${Math.round(device.alt)}m` : '未知';
    return {
      ...base,
      status: 'not_moved',
      movementMeters,
      summary: `最近 30 分鐘位移約 ${movementMeters}m，低於 ${MOVEMENT_THRESHOLD_METERS}m 門檻，未重複查詢 Google Elevation；目前裝置回報海拔 ${alt}。`
    };
  }

  return queryTerrain(device, base, movementMeters, `最近 30 分鐘位移約 ${movementMeters}m`);
}
