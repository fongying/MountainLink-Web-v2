import { json } from '@sveltejs/kit';
import { getEqLatestEvent } from '$lib/server/earthquake';

export const GET = async ({ locals }: any) => {
  if (!locals?.user) return new Response('Unauthorized', { status: 401 });

  const event = await getEqLatestEvent();
  return json({
    updatedAt: Date.now(),
    event
  });
};
