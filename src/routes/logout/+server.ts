// src/routes/logout/+server.ts
import { redirect } from '@sveltejs/kit';
import { invalidateSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const POST = async ({ cookies }: { cookies: any }) => {
  const sid = cookies.get(SESSION_COOKIE_NAME);
  if (sid) {
    await invalidateSession(sid); // ✅
  }

  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  throw redirect(302, '/login');
};
