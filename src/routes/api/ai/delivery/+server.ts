import { json } from '@sveltejs/kit';
import { isIngestAuthorized } from '$lib/server/device-telemetry';
import { acceptAiDelivery } from '$lib/server/ai-delivery';
import { getLatestAiRecommendation } from '$lib/server/ai-agent';
import { broadcastSse } from '$lib/server/stream';
export const POST = async ({ request }: any) => {
  if (!isIngestAuthorized(request, false)) return new Response('Unauthorized', { status: 401 });
  let body;
  try { body = await request.json(); } catch { return json({ ok: false }, { status: 400 }); }
  if (!await acceptAiDelivery(body)) return json({ ok: false }, { status: 400 });
  const latest = await getLatestAiRecommendation();
  if (latest) broadcastSse('ai_recommendation_update', latest);
  return json({ ok: true });
};
