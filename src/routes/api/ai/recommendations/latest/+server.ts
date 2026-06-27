import { json } from '@sveltejs/kit';
import { getLatestAiRecommendation } from '$lib/server/ai-agent';

export const GET = async ({ locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  return json({
    ok: true,
    recommendation: await getLatestAiRecommendation()
  });
};
