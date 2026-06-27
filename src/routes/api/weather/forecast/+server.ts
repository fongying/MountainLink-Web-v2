import { json } from '@sveltejs/kit';
import {
  getMountainForecastSnapshotCached,
  listMountainForecastTargets
} from '$lib/server/forecast';

export const GET = async ({ request, locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
  const targetsOnly =
    url.searchParams.get('targets') === '1' || url.searchParams.get('targets') === 'true';
  const horizonHours = Number(url.searchParams.get('horizonHours') ?? 72);

  if (targetsOnly) {
    return json({
      ok: true,
      targets: listMountainForecastTargets()
    });
  }

  const snapshot = await getMountainForecastSnapshotCached({
    force,
    horizonHours: Number.isFinite(horizonHours) ? Math.max(1, Math.min(168, horizonHours)) : 72
  });

  return json({
    ok: true,
    snapshot
  });
};
