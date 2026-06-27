import type { AlertItem } from '$lib/types/alerts';
import type { ColdAlert, RainAlert } from '$lib/types';
import { splitTaiwanArea, toMountainAreaNames } from '$lib/mountain-areas';
import { getColdAlertsCached, isColdCacheExpired } from '$lib/server/alerts/cold';
import { getRainAlertsCached, isRainCacheExpired } from '$lib/server/alerts/rain';
import { listEqEvents } from '$lib/server/earthquake';
import {
  filterEqLast3Days,
  mapColdToAlertItems,
  mapEqToAlertItems,
  mapRainToAlertItems,
  sortAlerts
} from '$lib/utils/alerts';

export type HazardSnapshot = {
  generatedAt: string;
  items: AlertItem[];
  reason?: string;
  notice?: string;
};

let snapshot: HazardSnapshot | null = null;
let snapshotHash = '';

function countiesFromAreas(areas: string[]) {
  return Array.from(
    new Set(
      areas
        .map((area) => splitTaiwanArea(area)?.county)
        .filter((county): county is string => Boolean(county))
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function filterMountainRainAlerts(alerts: RainAlert[]) {
  return alerts
    .map((alert) => ({
      ...alert,
      areas: toMountainAreaNames(alert.areas)
    }))
    .filter((alert) => alert.areas.length > 0);
}

function filterMountainColdAlerts(alerts: ColdAlert[]) {
  return alerts
    .map((alert) => {
      const areas = toMountainAreaNames(alert.areas.length > 0 ? alert.areas : alert.counties);
      return {
        ...alert,
        areas,
        counties: countiesFromAreas(areas)
      };
    })
    .filter((alert) => alert.areas.length > 0);
}

function computeHash(items: AlertItem[], notice?: string) {
  return JSON.stringify({
    notice: notice || '',
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      severity: item.severity,
      title: item.title,
      summary: item.summary,
      issuedAt: item.issuedAt,
      eventAt: item.eventAt,
      region: item.region
    }))
  });
}

export function shouldRefreshUnifiedHazards(now = Date.now()) {
  if (!snapshot) return true;
  return isRainCacheExpired(now) || isColdCacheExpired(now);
}

export async function getUnifiedHazardItems() {
  const [rainResult, coldResult, eqResult] = await Promise.allSettled([
    getRainAlertsCached(),
    getColdAlertsCached(),
    listEqEvents()
  ]);

  const items: AlertItem[] = [];
  const failedKinds: string[] = [];

  if (rainResult.status === 'fulfilled') {
    items.push(...mapRainToAlertItems(filterMountainRainAlerts(rainResult.value)));
  } else {
    failedKinds.push('豪雨');
  }

  if (coldResult.status === 'fulfilled') {
    items.push(...mapColdToAlertItems(filterMountainColdAlerts(coldResult.value)));
  } else {
    failedKinds.push('低溫');
  }

  if (eqResult.status === 'fulfilled') {
    const mappedEq = mapEqToAlertItems(eqResult.value);
    items.push(...filterEqLast3Days(sortAlerts(mappedEq)));
  } else {
    failedKinds.push('地震');
  }

  return {
    items: sortAlerts(items),
    notice: failedKinds.length > 0 ? `部分資料無法更新：${failedKinds.join('、')}` : ''
  };
}

export async function getUnifiedHazardSnapshot(options?: { force?: boolean; reason?: string }) {
  const force = options?.force ?? false;
  const reason = options?.reason;

  if (!force && snapshot && !shouldRefreshUnifiedHazards()) {
    return { snapshot: { ...snapshot, reason: reason || snapshot.reason }, changed: false };
  }

  const built = await getUnifiedHazardItems();
  const generatedAt = new Date().toISOString();
  const next: HazardSnapshot = {
    generatedAt,
    items: built.items,
    reason,
    notice: built.notice || undefined
  };

  const nextHash = computeHash(next.items, next.notice);
  const changed = nextHash !== snapshotHash;

  snapshot = next;
  snapshotHash = nextHash;

  return { snapshot: next, changed };
}
