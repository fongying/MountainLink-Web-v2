import type { AlertItem, Severity } from '$lib/types/alerts';
import { mountainTownsForCounty, splitTaiwanArea } from '$lib/mountain-areas';

export type MapAlertRegion = {
  id: string;
  areaKey: string;
  label: string;
  severity: Severity;
};

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3
};

function splitRegion(region?: string) {
  return (region ?? '')
    .split(/[、，,]/)
    .map((area) => area.trim())
    .filter(Boolean);
}

function normalizeAreaKey(areaKey: string) {
  return areaKey.replace(/台/g, '臺');
}

function alertAreasFromItem(item: AlertItem) {
  const parsedAreas = splitRegion(item.region);
  const expanded: string[] = [];

  for (const area of parsedAreas) {
    const parsed = splitTaiwanArea(area);
    if (!parsed) continue;

    if (parsed.town) {
      expanded.push(normalizeAreaKey(`${parsed.county}${parsed.town}`));
      continue;
    }

    expanded.push(...mountainTownsForCounty(parsed.county).map((town) => normalizeAreaKey(`${parsed.county}${town}`)));
  }

  return expanded;
}

export function mapAlertRegionsFromItems(items: AlertItem[], limit = 120): MapAlertRegion[] {
  const byArea = new Map<string, { severity: Severity; title: string }>();

  for (const item of items) {
    if (item.status === 'ended') continue;
    if (item.severity === 'info') continue;

    for (const areaKey of alertAreasFromItem(item)) {
      const current = byArea.get(areaKey);
      if (!current || SEVERITY_RANK[item.severity] > SEVERITY_RANK[current.severity]) {
        byArea.set(areaKey, { severity: item.severity, title: item.title });
      }
    }
  }

  return Array.from(byArea.entries())
    .map(([areaKey, meta]) => ({
      id: `${meta.severity}:${areaKey}`,
      areaKey,
      label: `${areaKey} ${meta.title}`,
      severity: meta.severity
    }))
    .slice(0, limit);
}
