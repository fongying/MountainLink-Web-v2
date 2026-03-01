import { json } from '@sveltejs/kit';
import { getRainAlertsCached } from '$lib/server/alerts/rain';

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

function rainLevelRank(level: string) {
  if (level.includes('超大豪雨')) return 4;
  if (level.includes('大豪雨')) return 3;
  if (level.includes('豪雨')) return 2;
  if (level.includes('大雨')) return 1;
  return 0;
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

  let alerts = await getRainAlertsCached();

  if (severityLevel) {
    alerts = alerts.filter(
      (a) =>
        a.level.includes(severityLevel) ||
        a.title.includes(severityLevel) ||
        a.headline.includes(severityLevel)
    );
  }

  if (typeof expires === 'boolean') {
    const now = Date.now();
    alerts = alerts.filter((a) => {
      if (a.expiresAt == null) return !expires;
      return expires ? a.expiresAt <= now : a.expiresAt > now;
    });
  }

  if (county) {
    alerts = alerts.filter((a) => a.areas.includes(county));
  }

  if (!includeEnded && activeOnly) {
    alerts = alerts.filter((a) => a.status === 'active');
  } else if (!includeEnded && !activeOnly) {
    alerts = alerts.filter((a) => a.status !== 'ended');
  }

  alerts = alerts
    .slice()
    .sort((a, b) => rainLevelRank(b.level) - rainLevelRank(a.level) || b.issuedAt - a.issuedAt)
    .slice(0, limit);

  return json({
    updatedAt: Date.now(),
    alerts
  });
};
