import { json } from '@sveltejs/kit';
import { fetchRainAlerts } from '$lib/server/alerts/rain';
import type { RainAlert } from '$lib/types';

function parseBool(v: string | null, defaultValue: boolean) {
  if (v == null) return defaultValue;
  const n = v.trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'yes';
}

function parseLimit(v: string | null, defaultValue: number) {
  const n = Number(v ?? defaultValue);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

export const GET = async ({ locals, url }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const county = (url.searchParams.get('county') || '').trim();
  const activeOnly = parseBool(url.searchParams.get('activeOnly'), true);
  const includeEnded = parseBool(url.searchParams.get('includeEnded'), false);
  const limit = parseLimit(url.searchParams.get('limit'), 50);

  const severityLevel = (url.searchParams.get('severity_level') || '').trim();
  const expiresQuery = url.searchParams.get('expires');
  const expires =
    expiresQuery == null || expiresQuery.trim() === ''
      ? undefined
      : parseBool(expiresQuery, false);

  let alerts = await fetchRainAlerts({
    severityLevel: severityLevel || undefined,
    expires
  });

  alerts = alerts
    .slice()
    .sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));

  if (county) {
    alerts = alerts.filter((a) => a.areas.includes(county));
  }

  if (!includeEnded && activeOnly) {
    alerts = alerts.filter((a) => a.status === 'active');
  } else if (!includeEnded && !activeOnly) {
    alerts = alerts.filter((a) => a.status !== 'ended');
  }

  const levels: Record<RainAlert['level'], number> = {
    超大豪雨: 4,
    大豪雨: 3,
    豪雨: 2,
    大雨: 1
  };

  alerts = alerts
    .slice()
    .sort((a, b) => levels[b.level] - levels[a.level] || b.issuedAt - a.issuedAt)
    .slice(0, limit);

  return json({
    updatedAt: Date.now(),
    alerts
  });
};
