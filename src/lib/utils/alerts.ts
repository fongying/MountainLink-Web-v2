import type { AlertItem, HazardType, Severity } from '$lib/types/alerts';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  warning: 3,
  watch: 2,
  info: 1
};

const TYPE_WEIGHT: Record<HazardType, number> = {
  earthquake: 3,
  cold: 2,
  rain: 1
};

function toIso(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    const ts = Date.parse(v);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return undefined;
}

function toTs(v?: string): number {
  if (!v) return 0;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}

function eqSeverityByMagnitude(magnitude?: number): Severity {
  if (magnitude == null || !Number.isFinite(magnitude)) return 'watch';
  if (magnitude >= 6) return 'critical';
  if (magnitude >= 5) return 'warning';
  if (magnitude >= 4) return 'watch';
  return 'info';
}

function rainSeverity(level: string): Severity {
  if (level.includes('超大豪雨')) return 'critical';
  if (level.includes('大豪雨') || level.includes('豪雨')) return 'warning';
  if (level.includes('大雨')) return 'watch';
  return 'watch';
}

function coldSeverity(level: string): Severity {
  if (level.includes('紅色')) return 'critical';
  if (level.includes('橙色')) return 'warning';
  if (level.includes('黃色')) return 'watch';
  return 'watch';
}

function fallbackId(parts: Array<string | number | undefined>) {
  return parts.map((p) => String(p ?? '')).join('|');
}

export function earthquakeRegionFromLocation(location: string): string | undefined {
  const locatedArea = location.match(/位於\s*([^\s，、,()（）]+?[縣市])\s*([^\s，、,()（）]+?[鄉鎮市區])/);
  if (locatedArea) return `${locatedArea[1]}${locatedArea[2]}`.replace(/^台/, '臺');

  const directArea = location.trim().match(/^([^\s，、,()（）]+?[縣市])\s*([^\s，、,()（）]+?[鄉鎮市區])$/);
  if (directArea) return `${directArea[1]}${directArea[2]}`.replace(/^台/, '臺');

  return undefined;
}

export function mapEqToAlertItems(rawEq: unknown): AlertItem[] {
  const rows = Array.isArray(rawEq) ? rawEq : [];

  return rows.map((row, index) => {
    const r = row as Record<string, unknown>;
    const magnitude =
      typeof r.magnitude === 'number'
        ? r.magnitude
        : typeof r.Magnitude === 'number'
          ? r.Magnitude
          : undefined;
    const depthKm =
      typeof r.depthKm === 'number'
        ? r.depthKm
        : typeof r.depth === 'number'
          ? r.depth
          : undefined;

    const location =
      (typeof r.epicenterText === 'string' && r.epicenterText) ||
      (typeof r.location === 'string' && r.location) ||
      '';

    const eventAt = toIso(r.originTime) || toIso(r.eventAt) || toIso(r.firstSeenAt);
    const issuedAt = toIso(r.reportedAt) || toIso(r.issuedAt);

    const titleFromPayload = typeof r.title === 'string' ? r.title : '';
    const title =
      titleFromPayload ||
      (magnitude != null ? `地震 M${magnitude.toFixed(1)}` : '地震通知');

    const summaryFromPayload = typeof r.summary === 'string' ? r.summary : '';
    const summary =
      summaryFromPayload ||
      [location, depthKm != null ? `深度 ${depthKm} km` : '']
        .filter(Boolean)
        .join('，') ||
      '地震事件';

    const id =
      (typeof r.id === 'string' && r.id) ||
      fallbackId([eventAt, location, magnitude, index]);

    return {
      id,
      type: 'earthquake',
      status: 'active',
      title,
      summary,
      severity: eqSeverityByMagnitude(magnitude),
      issuedAt,
      eventAt,
      region: earthquakeRegionFromLocation(location),
      source: 'CWA',
      raw: row
    } satisfies AlertItem;
  });
}

export function mapColdToAlertItems(rawCold: unknown): AlertItem[] {
  const rows = Array.isArray(rawCold) ? rawCold : [];

  return rows.map((row, index) => {
    const r = row as Record<string, unknown>;
    const counties =
      Array.isArray(r.counties) && r.counties.every((x) => typeof x === 'string')
        ? (r.counties as string[])
        : Array.isArray(r.areas) && r.areas.every((x) => typeof x === 'string')
          ? (r.areas as string[])
          : [];
    const level = typeof r.level === 'string' ? r.level : '低溫特報';
    const title = typeof r.title === 'string' && r.title ? r.title : '低溫特報';
    const headline = typeof r.headline === 'string' ? r.headline : '';

    return {
      id:
        (typeof r.id === 'string' && r.id) ||
        fallbackId([title, headline, toIso(r.issuedAt), index]),
      type: 'cold',
      status: typeof r.status === 'string' && r.status === 'ended' ? 'ended' : 'active',
      title,
      summary: headline || '低溫警示',
      severity: coldSeverity(level),
      issuedAt: toIso(r.issuedAt) || toIso(r.onsetAt),
      eventAt: toIso(r.onsetAt),
      region: counties.join('、') || undefined,
      source: 'CWA',
      raw: row
    } satisfies AlertItem;
  });
}

export function mapRainToAlertItems(rawRain: unknown): AlertItem[] {
  const rows = Array.isArray(rawRain) ? rawRain : [];

  return rows.map((row, index) => {
    const r = row as Record<string, unknown>;
    const areas =
      Array.isArray(r.areas) && r.areas.every((x) => typeof x === 'string')
        ? (r.areas as string[])
        : [];
    const level = typeof r.level === 'string' ? r.level : '大雨特報';
    const title = typeof r.title === 'string' && r.title ? r.title : '大雨特報';
    const headline = typeof r.headline === 'string' ? r.headline : '';

    return {
      id:
        (typeof r.id === 'string' && r.id) ||
        fallbackId([title, headline, toIso(r.issuedAt), index]),
      type: 'rain',
      status: typeof r.status === 'string' && r.status === 'ended' ? 'ended' : 'active',
      title,
      summary: headline || '降雨警示',
      severity: rainSeverity(level),
      issuedAt: toIso(r.issuedAt) || toIso(r.onsetAt),
      eventAt: toIso(r.onsetAt),
      region: areas.join('、') || undefined,
      source: 'CWA',
      raw: row
    } satisfies AlertItem;
  });
}

export function filterEqLast3Days(items: AlertItem[]): AlertItem[] {
  const cutoff = Date.now() - 72 * 60 * 60 * 1000;

  return items
    .filter((item) => {
      const ts = toTs(item.eventAt) || toTs(item.issuedAt);
      return ts >= cutoff;
    })
    .slice(0, 3);
}

export function sortAlerts(items: AlertItem[]): AlertItem[] {
  return items
    .slice()
    .sort((a, b) => {
      const severityDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (severityDiff !== 0) return severityDiff;

      const tsA = toTs(a.eventAt) || toTs(a.issuedAt);
      const tsB = toTs(b.eventAt) || toTs(b.issuedAt);
      if (tsB !== tsA) return tsB - tsA;

      const typeDiff = TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type];
      if (typeDiff !== 0) return typeDiff;

      return a.id.localeCompare(b.id);
    });
}
