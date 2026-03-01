import { createHash } from 'node:crypto';
import type { ColdAlert, ColdLevel } from '$lib/types';
import { fetchCwaDatastore } from '$lib/server/cwa';

const DATASET_ID = 'W-C0033-004';

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

type CwaColdResponse = {
  records?: {
    info?: CwaInfo[];
  };
};

function parseTs(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : undefined;
}

function getParam(info: CwaInfo, name: string) {
  const p = (info.parameter ?? []).find((x) => x.valueName === name);
  return (p?.value || '').trim();
}

function parseLevel(title: string, headline: string, severityLevel: string): ColdLevel {
  const text = `${severityLevel} ${title} ${headline}`;
  if (text.includes('紅色')) return '低溫紅色燈號';
  if (text.includes('橙色')) return '低溫橙色燈號';
  if (text.includes('黃色')) return '低溫黃色燈號';
  return '低溫特報';
}

function parseStatus(headline: string): 'active' | 'ended' {
  return headline.includes('解除') ? 'ended' : 'active';
}

function normalizeCounty(area: string): string {
  const trimmed = area.trim();
  const matched = trimmed.match(/^.+?[縣市]/);
  return matched?.[0] || trimmed;
}

function getAreas(info: CwaInfo): string[] {
  const areas = (info.area ?? [])
    .map((a) => (a.areaDesc || '').trim())
    .filter(Boolean);
  return Array.from(new Set(areas)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function getCounties(areas: string[]): string[] {
  return Array.from(new Set(areas.map((a) => normalizeCounty(a)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );
}

function alertId(
  status: 'active' | 'ended',
  level: ColdLevel,
  issuedAt: number,
  counties: string[],
  areas: string[]
) {
  const raw = `COLD|${status}|${level}|${issuedAt}|${counties.join(',')}|${areas.join(',')}`;
  return createHash('sha1').update(raw).digest('hex');
}

export async function fetchColdAlerts(options?: {
  severityLevel?: string;
  expires?: boolean;
}): Promise<ColdAlert[]> {
  const params: Record<string, string> = {};
  if (options?.severityLevel) params.severity_level = options.severityLevel;
  if (typeof options?.expires === 'boolean') params.expires = String(options.expires);

  const raw = await fetchCwaDatastore<CwaColdResponse>(DATASET_ID, params);
  const infos = raw.records?.info ?? [];

  const alerts: ColdAlert[] = [];
  for (const info of infos) {
    const headline = (info.headline || '').trim();
    const title = getParam(info, 'alert_title') || headline || '低溫特報';
    const severityLevel = getParam(info, 'severity_level');
    const level = parseLevel(title, headline, severityLevel);

    const issuedAt = parseTs(info.effective) ?? parseTs(info.onset);
    if (!issuedAt) continue;

    const areas = getAreas(info);
    const counties = getCounties(areas);
    const description = (info.description || '').trim();
    const status = parseStatus(headline);

    alerts.push({
      id: alertId(status, level, issuedAt, counties, areas),
      kind: 'COLD',
      status,
      level,
      headline,
      title,
      description,
      web: info.web,
      issuedAt,
      onsetAt: parseTs(info.onset),
      expiresAt: parseTs(info.expires),
      areas,
      counties,
      raw: info
    });
  }

  return alerts;
}
