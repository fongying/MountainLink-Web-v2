import { json } from '@sveltejs/kit';
import { listEqEvents } from '$lib/server/earthquake';

function parseLimit(v: string | null, fallback = 50) {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(n)));
}

export const GET = async ({ locals, url }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const limit = parseLimit(url.searchParams.get('limit'), 50);
  const events = await listEqEvents(limit);

  return json({
    updatedAt: Date.now(),
    events
  });
};
