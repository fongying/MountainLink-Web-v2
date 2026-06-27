import { json } from '@sveltejs/kit';
import { runAiRecommendationAnalysis } from '$lib/server/ai-agent';

export const POST = async ({ locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });
  if (!locals.user.is_admin) return new Response('Forbidden', { status: 403 });

  try {
    const recommendation = await runAiRecommendationAnalysis({
      reason: 'manual_dashboard_run',
      broadcast: true
    });
    return json({ ok: true, recommendation });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'AI analysis failed'
      },
      { status: 500 }
    );
  }
};
