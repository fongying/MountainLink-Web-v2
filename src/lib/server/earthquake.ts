import { randomUUID } from 'node:crypto';
import type { EarthquakeEvent, EqReport, EqTrigger } from '$lib/types';
import { fetchCwaDatastore } from '$lib/server/cwa';

const DATASET_ID = 'E-A0015-001';
const POLL_INTERVAL_MS = 90_000;
const MATCH_WINDOW_MS = 5 * 60_000;
const TRIGGER_DEDUP_BUCKET_MS = 10_000;
const MAX_REPORTS = 400;
const MAX_TRIGGERS = 1_500;
const MAX_EVENTS = 500;

type RawResponse = {
  records?: {
    Earthquake?: RawEarthquake[];
  };
};

type RawEarthquake = {
  EarthquakeNo?: number | string;
  ReportContent?: string;
  Web?: string;
  ReportImageURI?: string;
  ShakemapImageURI?: string;
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
  Intensity?: {
    ShakingArea?: RawShakingArea[];
  };
};

type RawShakingArea = {
  CountyName?: string;
  InfoStatus?: string;
  AreaIntensity?: string;
};

export type TriggerWebhookPayload = {
  source?: 'EQ_WAKEUP' | 'OTHER_APP' | string;
  triggeredAt?: number;
  site?: { county?: string; town?: string };
  thresholdIntensity?: number;
  estimatedIntensity?: number;
  raw?: unknown;
};

const state = {
  lastPolledAt: 0,
  pollingPromise: null as Promise<void> | null,

  reportsById: new Map<string, EqReport>(),
  triggersById: new Map<string, EqTrigger>(),
  eventsById: new Map<string, EarthquakeEvent>(),

  reportToEventId: new Map<string, string>(),
  triggerToEventId: new Map<string, string>(),
  triggerDedupIdByKey: new Map<string, string>()
};

function normalizeCountyName(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('台') ? `臺${trimmed.slice(1)}` : trimmed;
}

function splitCountyNames(v?: string): string[] {
  if (!v) return [];
  return Array.from(
    new Set(
      v
        .split(/[、,，/]/)
        .map((x) => normalizeCountyName(x))
        .filter(Boolean)
    )
  );
}

function parseNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseIntensity(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.match(/[1-7]/);
  return m ? Number(m[0]) : undefined;
}

function parseOriginTime(v?: string): number | undefined {
  if (!v) return undefined;
  const raw = v.trim();
  if (!raw) return undefined;

  const hasZone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
  const normalized = hasZone ? raw : `${raw}+08:00`;
  const n = Date.parse(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function toIntensityByCounty(areas: RawShakingArea[] = []): Record<string, number> {
  const byCounty: Record<string, number> = {};
  const observe = areas.filter((a) => (a.InfoStatus || '').toLowerCase() === 'observe');
  const others = areas.filter((a) => (a.InfoStatus || '').toLowerCase() !== 'observe');

  const apply = (area: RawShakingArea, fillOnly = false) => {
    const intensity = parseIntensity(area.AreaIntensity);
    if (intensity == null) return;

    for (const county of splitCountyNames(area.CountyName)) {
      if (fillOnly && byCounty[county] != null) continue;
      byCounty[county] = Math.max(byCounty[county] ?? 0, intensity);
    }
  };

  observe.forEach((a) => apply(a, false));
  others.forEach((a) => apply(a, true));

  return byCounty;
}

function maxIntensity(byCounty: Record<string, number>): number | undefined {
  const values = Object.values(byCounty).filter((v) => Number.isFinite(v));
  if (!values.length) return undefined;
  return Math.max(...values);
}

function buildReportSummary(byCounty: Record<string, number>): string {
  const entries = Object.entries(byCounty).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  if (!entries.length) return '尚無震度分布資料';

  const top = entries.slice(0, 6).map(([county, intensity]) => `${county}${intensity}級`);
  if (entries.length > top.length) top.push(`等${entries.length}縣市`);
  return top.join('，');
}

function reportSeverity(report: EqReport, triggerCount: number): number {
  return (report.maxIntensity ?? 0) * 100 + (report.magnitude ?? 0) * 10 + (triggerCount > 0 ? 5 : 0);
}

function triggerSeverity(trigger: EqTrigger): number {
  return (trigger.estimatedIntensity ?? trigger.thresholdIntensity) * 100 + trigger.thresholdIntensity * 3;
}

function buildReportEvent(report: EqReport, triggerIds: string[]): EarthquakeEvent {
  const summary = buildReportSummary(report.intensityByCounty);
  const maxI = report.maxIntensity ?? 0;
  const magnitudeText =
    report.magnitude != null && Number.isFinite(report.magnitude) ? `M${report.magnitude.toFixed(1)}` : '地震';

  const firstSeenAt = Math.min(
    report.originTime,
    ...triggerIds
      .map((id) => state.triggersById.get(id)?.triggeredAt)
      .filter((v): v is number => typeof v === 'number')
  );

  return {
    id: report.id,
    kind: 'EARTHQUAKE',
    hasReport: true,
    hasTrigger: triggerIds.length > 0,
    reportId: report.id,
    triggerIds: triggerIds.slice(),
    firstSeenAt,
    originTime: report.originTime,
    reportedAt: report.issuedAt,
    magnitude: report.magnitude,
    depthKm: report.depthKm,
    epicenterLat: report.epicenter.lat,
    epicenterLon: report.epicenter.lon,
    epicenterText: report.epicenter.locationText,
    maxIntensity: maxI || undefined,
    intensityByCounty: { ...report.intensityByCounty },
    title: `${magnitudeText} ${report.epicenter.locationText || '未知震央'}（最大震度${maxI || '-'}）`,
    summary,
    severityScore: reportSeverity(report, triggerIds.length),
    raw: {
      report: report.raw,
      triggerIds
    }
  };
}

function buildTriggerOnlyEvent(trigger: EqTrigger): EarthquakeEvent {
  const area = `${trigger.site.county}${trigger.site.town ? ` ${trigger.site.town}` : ''}`;
  const estimated =
    trigger.estimatedIntensity != null ? `，估計震度 ${trigger.estimatedIntensity}` : '';
  return {
    id: `trigger:${trigger.id}`,
    kind: 'EARTHQUAKE',
    hasReport: false,
    hasTrigger: true,
    triggerIds: [trigger.id],
    firstSeenAt: trigger.receivedAt,
    title: `地震觸發 ${area}`,
    summary: `來源 ${trigger.source}，門檻震度 ${trigger.thresholdIntensity}${estimated}`,
    severityScore: triggerSeverity(trigger),
    raw: { trigger }
  };
}

function pickBestReportForTrigger(trigger: EqTrigger): EqReport | null {
  const county = normalizeCountyName(trigger.site.county);
  let winner: EqReport | null = null;
  let bestDelta = Number.MAX_SAFE_INTEGER;

  for (const report of state.reportsById.values()) {
    const intensity = report.intensityByCounty[county];
    if (intensity == null || intensity < 1) continue;

    const delta = Math.abs(report.originTime - trigger.triggeredAt);
    if (delta > MATCH_WINDOW_MS) continue;

    if (delta < bestDelta) {
      bestDelta = delta;
      winner = report;
    }
  }

  return winner;
}

function findMatchingTriggersForReport(report: EqReport): string[] {
  const triggerIds: string[] = [];
  const counties = new Set(Object.keys(report.intensityByCounty));

  for (const trigger of state.triggersById.values()) {
    const county = normalizeCountyName(trigger.site.county);
    if (!counties.has(county)) continue;
    if (Math.abs(trigger.triggeredAt - report.originTime) > MATCH_WINDOW_MS) continue;
    triggerIds.push(trigger.id);
  }

  return triggerIds;
}

function upsertReportEvent(report: EqReport, triggerIds: string[]) {
  const event = buildReportEvent(report, triggerIds);
  state.eventsById.set(event.id, event);
  state.reportToEventId.set(report.id, event.id);

  for (const triggerId of triggerIds) {
    const previous = state.triggerToEventId.get(triggerId);
    if (previous && previous.startsWith('trigger:')) {
      state.eventsById.delete(previous);
    }
    state.triggerToEventId.set(triggerId, event.id);
  }
}

function upsertReport(report: EqReport) {
  const previous = state.reportsById.get(report.id);
  const merged = previous ? { ...previous, ...report } : report;
  state.reportsById.set(report.id, merged);

  const triggerIds = findMatchingTriggersForReport(merged);
  upsertReportEvent(merged, triggerIds);
}

function upsertTriggerOnlyEvent(trigger: EqTrigger) {
  const event = buildTriggerOnlyEvent(trigger);
  state.eventsById.set(event.id, event);
  state.triggerToEventId.set(trigger.id, event.id);
}

function dedupKey(source: string, county: string, town: string, thresholdIntensity: number, triggeredAt: number) {
  const bucket = Math.floor(triggeredAt / TRIGGER_DEDUP_BUCKET_MS);
  return `${source}|${county}|${town}|${thresholdIntensity}|${bucket}`;
}

function prune() {
  const reportIds = Array.from(state.reportsById.keys()).sort((a, b) => Number(b) - Number(a));
  for (const id of reportIds.slice(MAX_REPORTS)) {
    state.reportsById.delete(id);
    state.reportToEventId.delete(id);
  }

  const triggers = Array.from(state.triggersById.values()).sort((a, b) => b.triggeredAt - a.triggeredAt);
  for (const trigger of triggers.slice(MAX_TRIGGERS)) {
    state.triggersById.delete(trigger.id);
    state.triggerToEventId.delete(trigger.id);
  }

  const events = Array.from(state.eventsById.values()).sort(
    (a, b) => b.severityScore - a.severityScore || b.firstSeenAt - a.firstSeenAt
  );
  for (const event of events.slice(MAX_EVENTS)) {
    state.eventsById.delete(event.id);
  }
}

export function parseEqReportEA0015001(raw: unknown, issuedAt = Date.now()): EqReport[] {
  const response = raw as RawResponse;
  const earthquakes = response.records?.Earthquake ?? [];
  const reports: EqReport[] = [];

  for (const eq of earthquakes) {
    const earthquakeNo = parseNumber(eq.EarthquakeNo);
    if (earthquakeNo == null) continue;

    const info = eq.EarthquakeInfo;
    const epicenter = info?.Epicenter;
    const originTime = parseOriginTime(info?.OriginTime);
    if (originTime == null) continue;

    const intensityMap = toIntensityByCounty(eq.Intensity?.ShakingArea);
    const maxI = maxIntensity(intensityMap);

    reports.push({
      id: String(Math.trunc(earthquakeNo)),
      source: 'CWA_REPORT',
      earthquakeNo: Math.trunc(earthquakeNo),
      originTime,
      issuedAt,
      magnitude: parseNumber(info?.EarthquakeMagnitude?.MagnitudeValue),
      depthKm: parseNumber(info?.FocalDepth),
      epicenter: {
        lat: parseNumber(epicenter?.EpicenterLatitude) ?? 0,
        lon: parseNumber(epicenter?.EpicenterLongitude) ?? 0,
        locationText: (epicenter?.Location || '').trim()
      },
      intensityByCounty: intensityMap,
      maxIntensity: maxI,
      reportContent: (eq.ReportContent || '').trim(),
      web: (eq.Web || '').trim() || undefined,
      images: {
        report: (eq.ReportImageURI || '').trim() || undefined,
        shakemap: (eq.ShakemapImageURI || '').trim() || undefined
      },
      raw: eq
    });
  }

  return reports;
}

export async function pollEqReport(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - state.lastPolledAt < POLL_INTERVAL_MS) return;
  if (state.pollingPromise) {
    await state.pollingPromise;
    return;
  }

  state.pollingPromise = (async () => {
    const fetchedAt = Date.now();
    const raw = await fetchCwaDatastore<RawResponse>(DATASET_ID, { limit: '50' });
    const reports = parseEqReportEA0015001(raw, fetchedAt);
    for (const report of reports) upsertReport(report);
    state.lastPolledAt = Date.now();
    prune();
  })();

  try {
    await state.pollingPromise;
  } finally {
    state.pollingPromise = null;
  }
}

function normalizeTriggerPayload(input: TriggerWebhookPayload): Omit<EqTrigger, 'id' | 'receivedAt'> {
  const source = (input.source || 'OTHER_APP').toUpperCase();
  const county = normalizeCountyName(input.site?.county || '');
  const town = (input.site?.town || '').trim();
  const thresholdIntensity = Number(input.thresholdIntensity ?? 2);
  const estimatedIntensity =
    input.estimatedIntensity == null ? undefined : Number(input.estimatedIntensity);

  if (!county) throw new Error('site.county is required');
  if (!Number.isFinite(thresholdIntensity) || thresholdIntensity < 1 || thresholdIntensity > 7) {
    throw new Error('thresholdIntensity must be between 1 and 7');
  }

  const triggeredAt = Number(input.triggeredAt ?? Date.now());
  if (!Number.isFinite(triggeredAt)) throw new Error('triggeredAt must be a number');

  return {
    source: source === 'EQ_WAKEUP' ? 'EQ_WAKEUP' : 'OTHER_APP',
    triggeredAt,
    site: { county, town: town || undefined },
    thresholdIntensity: Math.round(thresholdIntensity),
    estimatedIntensity:
      estimatedIntensity != null && Number.isFinite(estimatedIntensity)
        ? Math.max(1, Math.min(7, Math.round(estimatedIntensity)))
        : undefined,
    raw: input.raw
  };
}

export async function receiveEqTrigger(payload: TriggerWebhookPayload) {
  await pollEqReport(false);

  const normalized = normalizeTriggerPayload(payload);
  const receivedAt = Date.now();

  const key = dedupKey(
    normalized.source,
    normalized.site.county,
    normalized.site.town || '',
    normalized.thresholdIntensity,
    normalized.triggeredAt
  );
  const dedupedTriggerId = state.triggerDedupIdByKey.get(key);
  if (dedupedTriggerId) {
    const existing = state.triggersById.get(dedupedTriggerId);
    if (existing) {
      existing.triggeredAt = Math.max(existing.triggeredAt, normalized.triggeredAt);
      existing.receivedAt = receivedAt;
      existing.estimatedIntensity = normalized.estimatedIntensity ?? existing.estimatedIntensity;
      existing.raw = normalized.raw ?? existing.raw;
      state.triggersById.set(existing.id, existing);

      return {
        deduped: true,
        trigger: existing,
        event: state.eventsById.get(state.triggerToEventId.get(existing.id) || '') ?? null
      };
    }
  }

  const trigger: EqTrigger = {
    id: randomUUID(),
    source: normalized.source,
    triggeredAt: normalized.triggeredAt,
    site: normalized.site,
    thresholdIntensity: normalized.thresholdIntensity,
    estimatedIntensity: normalized.estimatedIntensity,
    receivedAt,
    raw: normalized.raw
  };
  state.triggersById.set(trigger.id, trigger);
  state.triggerDedupIdByKey.set(key, trigger.id);

  const report = pickBestReportForTrigger(trigger);
  if (report) {
    const reportEventId = state.reportToEventId.get(report.id) || report.id;
    const existingEvent = state.eventsById.get(reportEventId);
    const triggerIds = Array.from(new Set([...(existingEvent?.triggerIds ?? []), trigger.id]));
    upsertReportEvent(report, triggerIds);
    return {
      deduped: false,
      trigger,
      event: state.eventsById.get(reportEventId) ?? null
    };
  }

  upsertTriggerOnlyEvent(trigger);
  prune();

  return {
    deduped: false,
    trigger,
    event: state.eventsById.get(`trigger:${trigger.id}`) ?? null
  };
}

export async function listEqEvents(limit = 50): Promise<EarthquakeEvent[]> {
  await pollEqReport(false);
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  return Array.from(state.eventsById.values())
    .sort((a, b) => b.severityScore - a.severityScore || b.firstSeenAt - a.firstSeenAt)
    .slice(0, safeLimit);
}

export async function getEqLatestEvent(): Promise<EarthquakeEvent | null> {
  const list = await listEqEvents(1);
  return list[0] ?? null;
}
