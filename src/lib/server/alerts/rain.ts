import { createHash } from 'node:crypto';
import type { RainAlert, RainLevel } from '$lib/types';
import { fetchCwaDatastore } from '$lib/server/cwa';

const DATASET_ID = 'W-C0033-003';

type CwaParam = {
  valueName?: string;
  value?: string;
};

type CwaArea = {
  areaDesc?: string;
};

type CwaInfo = {
  headline?: string;
  description?: string;
  web?: string;
  effective?: string;
  onset?: string;
  expires?: string;
  parameter?: CwaParam[];
  area?: CwaArea[];
};

type CwaRainResponse = {
  success?: string;
  records?: {
    info?: CwaInfo[];
  };
};

function parseLevel(title: string, headline: string): RainLevel | null {
  const text = `${title} ${headline}`;
  if (text.includes('超大豪雨')) return '超大豪雨';
  if (text.includes('大豪雨')) return '大豪雨';
  if (text.includes('豪雨')) return '豪雨';
  if (text.includes('大雨')) return '大雨';
  return null;
}

function parseTs(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : undefined;
}

function alertId(status: 'active' | 'ended', level: RainLevel, issuedAt: number, areas: string[]) {
  const raw = `RAIN|${status}|${level}|${issuedAt}|${areas.join(',')}`;
  return createHash('sha1').update(raw).digest('hex');
}

function getTitle(info: CwaInfo) {
  const p = (info.parameter ?? []).find((x) => x.valueName === 'alert_title');
  return (p?.value || '').trim();
}

function getAreas(info: CwaInfo) {
  const areas = (info.area ?? [])
    .map((a) => (a.areaDesc || '').trim())
    .filter(Boolean);
  return Array.from(new Set(areas)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export async function fetchRainAlerts(options?: {
  severityLevel?: string;
  expires?: boolean;
}): Promise<RainAlert[]> {
  const params: Record<string, string> = {};
  if (options?.severityLevel) params.severity_level = options.severityLevel;
  if (typeof options?.expires === 'boolean') params.expires = String(options.expires);

  const raw = await fetchCwaDatastore<CwaRainResponse>(DATASET_ID, params);
  const infos = raw.records?.info ?? [];

  const alerts: RainAlert[] = [];
  for (const info of infos) {
    const headline = (info.headline || '').trim();
    const title = getTitle(info);
    const level = parseLevel(title, headline);
    if (!level) continue;

    const issuedAt = parseTs(info.effective) ?? parseTs(info.onset);
    if (!issuedAt) continue;

    const status: 'active' | 'ended' = headline.includes('解除') ? 'ended' : 'active';
    const areas = getAreas(info);
    const description = (info.description || '').trim();

    alerts.push({
      id: alertId(status, level, issuedAt, areas),
      kind: 'RAIN',
      status,
      level,
      headline,
      title: title || headline,
      description,
      web: info.web,
      issuedAt,
      onsetAt: parseTs(info.onset),
      expiresAt: parseTs(info.expires),
      areas,
      raw: info
    });
  }

  return alerts;
}
