import { env } from '$env/dynamic/private';

function parseTtlSeconds(raw: string | undefined, fallback: number) {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export const CWA_RAIN_TTL_SEC = parseTtlSeconds(env.CWA_RAIN_TTL_SEC, 600);
export const CWA_COLD_TTL_SEC = parseTtlSeconds(env.CWA_COLD_TTL_SEC, 600);

export const CWA_RAIN_TTL_MS = CWA_RAIN_TTL_SEC * 1000;
export const CWA_COLD_TTL_MS = CWA_COLD_TTL_SEC * 1000;
