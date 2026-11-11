import type { AlertItem, HazardType, Severity } from '$lib/types/alerts';
import { mountainTownsForCounty, splitTaiwanArea } from '$lib/mountain-areas';

export type MapAlertRegion = {
  id: string;
  areaKey: string;
  label: string;
  severity: Severity;
  type: HazardType;
  hazardTypes: HazardType[];
};

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3
};

const HAZARD_TYPE_RANK: Record<HazardType, number> = {
  cold: 1,
  rain: 2,
  earthquake: 3
};

type AreaAlertMeta = {
  severity: Severity;
  type: HazardType;
  titles: string[];
  hazardTypes: HazardType[];
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
  const byArea = new Map<string, AreaAlertMeta>();

  for (const item of items) {
    if (item.status === 'ended') continue;
    if (item.severity === 'info') continue;

    for (const areaKey of alertAreasFromItem(item)) {
      const current = byArea.get(areaKey);
      if (!current) {
        byArea.set(areaKey, {
          severity: item.severity,
          type: item.type,
          titles: [item.title],
          hazardTypes: [item.type]
        });
        continue;
      }

      if (!current.titles.includes(item.title)) current.titles.push(item.title);
      if (!current.hazardTypes.includes(item.type)) current.hazardTypes.push(item.type);

      const isMoreSevere = SEVERITY_RANK[item.severity] > SEVERITY_RANK[current.severity];
      const winsSeverityTie =
        SEVERITY_RANK[item.severity] === SEVERITY_RANK[current.severity] &&
        HAZARD_TYPE_RANK[item.type] > HAZARD_TYPE_RANK[current.type];

      if (isMoreSevere || winsSeverityTie) {
        current.severity = item.severity;
        current.type = item.type;
      }
    }
  }

  return Array.from(byArea.entries())
    .map(([areaKey, meta]) => ({
      id: `${meta.type}:${meta.severity}:${areaKey}`,
      areaKey,
      label: `${areaKey} ${meta.titles.join('、')}`,
      severity: meta.severity,
      type: meta.type,
      hazardTypes: meta.hazardTypes
    }))
    .slice(0, limit);
}
