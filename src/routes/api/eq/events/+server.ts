import { json } from '@sveltejs/kit';
import { listEqEvents } from '$lib/server/earthquake';

export const GET = async ({ locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });
  const events = await listEqEvents();

  return json({
    updatedAt: Date.now(),
    events
  });
};
