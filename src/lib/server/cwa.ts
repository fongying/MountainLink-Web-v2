import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';

const BASE_URL = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
const DEFAULT_TTL_MS = 30_000;

type CacheEntry = {
  at: number;
  data: unknown;
};

type CwaParamValue = string | string[];

const cache = new Map<string, CacheEntry>();

function getAuthKey() {
  return env.CWA_API_KEY || env.CWA_OPEN_DATA_API_KEY || env.CWA_AUTHORIZATION || '';
}

function cacheKey(datasetId: string, params: Record<string, CwaParamValue>) {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const raw = `${datasetId}|${JSON.stringify(sorted)}`;
  return createHash('sha1').update(raw).digest('hex');
}

export async function fetchCwaDatastore<T>(
  datasetId: string,
  params: Record<string, CwaParamValue> = {},
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const auth = getAuthKey();
  if (!auth) {
    throw new Error('Missing CWA API key. Set CWA_API_KEY in environment.');
  }

  const query: Record<string, CwaParamValue> = {
    Authorization: auth,
    format: 'JSON',
    ...params
  };

  const key = cacheKey(datasetId, query);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) {
    return hit.data as T;
  }

  const url = new URL(`${BASE_URL}/${datasetId}`);
  Object.entries(query).forEach(([k, v]) => {
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
  });

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`CWA request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as T;
  cache.set(key, { at: now, data: json });
  return json;
}
