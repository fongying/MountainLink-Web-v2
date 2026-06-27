import type {
  MountainForecastLocation,
  MountainForecastPeriod,
  MountainForecastSnapshot
} from '$lib/types';
import { MOUNTAIN_FORECAST_LOCATIONS, mountainTownsForCounty } from '$lib/mountain-areas';
import { fetchCwaDatastore } from '$lib/server/cwa';
import { CWA_FORECAST_TTL_MS } from '$lib/server/alerts/cache-config';

const DEFAULT_HORIZON_HOURS = 72;

const FORECAST_ELEMENTS = [
  '天氣現象',
  '3小時降雨機率',
  '溫度',
  '體感溫度',
  '相對濕度',
  '風速',
  '風向',
  '舒適度指數',
  '天氣預報綜合描述'
];

const COUNTY_FORECAST_DATASETS: Record<string, string> = {
  宜蘭縣: 'F-D0047-001',
  桃園市: 'F-D0047-005',
  新竹縣: 'F-D0047-009',
  苗栗縣: 'F-D0047-013',
  南投縣: 'F-D0047-021',
  雲林縣: 'F-D0047-025',
  嘉義縣: 'F-D0047-029',
  屏東縣: 'F-D0047-033',
  臺東縣: 'F-D0047-037',
  花蓮縣: 'F-D0047-041',
  臺北市: 'F-D0047-061',
  高雄市: 'F-D0047-065',
  新北市: 'F-D0047-069',
  臺中市: 'F-D0047-073',
  臺南市: 'F-D0047-077'
};

type CwaElementValue = Record<string, string | number | undefined>;

type CwaForecastTime = {
  StartTime?: string;
  EndTime?: string;
  DataTime?: string;
  ElementValue?: CwaElementValue[];
};

type CwaWeatherElement = {
  ElementName?: string;
  Time?: CwaForecastTime[];
};

type CwaForecastLocation = {
  LocationName?: string;
  WeatherElement?: CwaWeatherElement[];
};

type CwaForecastResponse = {
  records?: {
    Locations?: Array<{
      LocationsName?: string;
      Location?: CwaForecastLocation[];
    }>;
  };
};

type ForecastSnapshotCache = {
  at: number;
  data: MountainForecastSnapshot;
};

let forecastSnapshot: ForecastSnapshotCache | null = null;
let forecastInFlight: Promise<MountainForecastSnapshot> | null = null;

function groupMountainLocations() {
  const groups = new Map<string, string[]>();
  for (const location of MOUNTAIN_FORECAST_LOCATIONS) {
    const towns = groups.get(location.county) ?? [];
    towns.push(location.town);
    groups.set(location.county, towns);
  }
  return groups;
}

function valueByKey(values: CwaElementValue[], keys: string[]) {
  for (const value of values) {
    for (const key of keys) {
      const raw = value[key];
      if (raw !== undefined && raw !== '') return String(raw);
    }
  }
  return undefined;
}

function toNumber(raw?: string) {
  if (!raw) return undefined;
  const matched = raw.match(/-?\d+(\.\d+)?/);
  if (!matched) return undefined;
  const n = Number(matched[0]);
  return Number.isFinite(n) ? n : undefined;
}

function periodKey(time: CwaForecastTime) {
  return [time.StartTime ?? '', time.EndTime ?? '', time.DataTime ?? ''].join('|');
}

function getPeriod(
  periods: Map<string, MountainForecastPeriod>,
  time: CwaForecastTime
): MountainForecastPeriod {
  const key = periodKey(time);
  const existing = periods.get(key);
  if (existing) return existing;

  const next: MountainForecastPeriod = {
    startTime: time.StartTime,
    endTime: time.EndTime,
    dataTime: time.DataTime
  };
  periods.set(key, next);
  return next;
}

function mergeElement(period: MountainForecastPeriod, elementName: string, values: CwaElementValue[]) {
  if (elementName === '天氣現象') {
    period.weather = valueByKey(values, ['Weather']);
    period.weatherCode = valueByKey(values, ['WeatherCode']);
    return;
  }

  if (elementName === '3小時降雨機率') {
    period.precipitationProbability = toNumber(
      valueByKey(values, ['ProbabilityOfPrecipitation', 'PoP'])
    );
    return;
  }

  if (elementName === '溫度') {
    period.temperature = toNumber(valueByKey(values, ['Temperature']));
    return;
  }

  if (elementName === '體感溫度') {
    period.apparentTemperature = toNumber(valueByKey(values, ['ApparentTemperature']));
    return;
  }

  if (elementName === '相對濕度') {
    period.relativeHumidity = toNumber(valueByKey(values, ['RelativeHumidity']));
    return;
  }

  if (elementName === '風速') {
    period.windSpeed = valueByKey(values, ['WindSpeed', 'BeaufortScale']);
    return;
  }

  if (elementName === '風向') {
    period.windDirection = valueByKey(values, ['WindDirection']);
    return;
  }

  if (elementName === '舒適度指數') {
    period.comfort = valueByKey(values, ['ComfortIndexDescription', 'ComfortIndex']);
    return;
  }

  if (elementName === '天氣預報綜合描述') {
    period.description = valueByKey(values, ['WeatherDescription']);
  }
}

function sortAndFilterPeriods(periods: MountainForecastPeriod[], horizonHours: number) {
  const now = Date.now();
  const cutoff = now + horizonHours * 60 * 60 * 1000;

  return periods
    .filter((period) => {
      const start = Date.parse(period.startTime ?? period.dataTime ?? '');
      const end = Date.parse(period.endTime ?? period.dataTime ?? '');
      if (!Number.isFinite(start) && !Number.isFinite(end)) return true;
      if (Number.isFinite(end) && end < now - 60 * 60 * 1000) return false;
      if (Number.isFinite(start) && start > cutoff) return false;
      return true;
    })
    .sort((a, b) => {
      const at = Date.parse(a.startTime ?? a.dataTime ?? '') || 0;
      const bt = Date.parse(b.startTime ?? b.dataTime ?? '') || 0;
      return at - bt;
    });
}

function buildRiskFlags(periods: MountainForecastPeriod[]) {
  const flags = new Set<string>();

  for (const period of periods) {
    const weatherText = `${period.weather ?? ''} ${period.description ?? ''}`;
    if ((period.precipitationProbability ?? 0) >= 70) flags.add('降雨機率偏高');
    if ((period.temperature ?? 99) <= 10) flags.add('低溫');
    if ((period.apparentTemperature ?? 99) <= 10) flags.add('體感低溫');
    if (/雷|豪雨|大雨|陣雨/.test(weatherText)) flags.add('降雨或雷雨');
    if (period.windSpeed && (toNumber(period.windSpeed) ?? 0) >= 6) flags.add('強風');
  }

  return Array.from(flags);
}

function parseLocationForecast(
  county: string,
  town: string,
  datasetId: string,
  location: CwaForecastLocation,
  horizonHours: number
): MountainForecastLocation {
  const periods = new Map<string, MountainForecastPeriod>();

  for (const element of location.WeatherElement ?? []) {
    const elementName = element.ElementName ?? '';
    for (const time of element.Time ?? []) {
      mergeElement(getPeriod(periods, time), elementName, time.ElementValue ?? []);
    }
  }

  const sortedPeriods = sortAndFilterPeriods(Array.from(periods.values()), horizonHours);

  return {
    county,
    town,
    datasetId,
    periods: sortedPeriods,
    riskFlags: buildRiskFlags(sortedPeriods)
  };
}

async function fetchCountyForecast(county: string, towns: string[], horizonHours: number) {
  const datasetId = COUNTY_FORECAST_DATASETS[county];
  if (!datasetId) return [];

  const raw = await fetchCwaDatastore<CwaForecastResponse>(
    datasetId,
    {
      LocationName: towns,
      ElementName: FORECAST_ELEMENTS,
      sort: 'time'
    },
    CWA_FORECAST_TTL_MS
  );

  const requested = new Set(towns);
  const locations = raw.records?.Locations?.flatMap((block) => block.Location ?? []) ?? [];

  return locations
    .filter((location) => requested.has(location.LocationName ?? ''))
    .map((location) =>
      parseLocationForecast(
        county,
        location.LocationName ?? '',
        datasetId,
        location,
        horizonHours
      )
    );
}

export function forecastDatasetForCounty(county: string) {
  return COUNTY_FORECAST_DATASETS[county];
}

export async function fetchMountainForecastSnapshot(options?: {
  horizonHours?: number;
}): Promise<MountainForecastSnapshot> {
  const horizonHours = options?.horizonHours ?? DEFAULT_HORIZON_HOURS;
  const groups = groupMountainLocations();
  const results = await Promise.all(
    Array.from(groups.entries()).map(([county, towns]) => fetchCountyForecast(county, towns, horizonHours))
  );

  return {
    issuedAt: new Date().toISOString(),
    source: 'CWA',
    horizonHours,
    locations: results
      .flat()
      .sort((a, b) => `${a.county}${a.town}`.localeCompare(`${b.county}${b.town}`, 'zh-Hant'))
  };
}

export function listMountainForecastTargets() {
  return MOUNTAIN_FORECAST_LOCATIONS.map(({ county, town }) => ({
    county,
    town,
    datasetId: forecastDatasetForCounty(county),
    enabled: Boolean(forecastDatasetForCounty(county) && mountainTownsForCounty(county).includes(town))
  }));
}

export function isMountainForecastCacheExpired(now = Date.now()) {
  return !forecastSnapshot || now - forecastSnapshot.at >= CWA_FORECAST_TTL_MS;
}

export async function getMountainForecastSnapshotCached(options?: {
  horizonHours?: number;
  force?: boolean;
}) {
  if (!options?.force && !isMountainForecastCacheExpired() && forecastSnapshot) {
    return { ...forecastSnapshot.data, locations: forecastSnapshot.data.locations.slice() };
  }

  if (forecastInFlight) {
    const data = await forecastInFlight;
    return { ...data, locations: data.locations.slice() };
  }

  forecastInFlight = fetchMountainForecastSnapshot({ horizonHours: options?.horizonHours });

  try {
    const data = await forecastInFlight;
    forecastSnapshot = { at: Date.now(), data };
    return { ...data, locations: data.locations.slice() };
  } finally {
    forecastInFlight = null;
  }
}
