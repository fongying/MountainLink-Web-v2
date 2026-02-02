// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { createSession, SESSION_COOKIE_NAME, verifyUser } from '$lib/server/auth';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

export const actions = {
  default: async ({ request, cookies, url}: any ) => {
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!username || !password) {
      return fail(400, { error: '請輸入帳號與密碼' });
    }

    // ✅ 一定要 await
    const user = await verifyUser(username, password);
    if (!user) {
      return fail(401, { error: '帳號或密碼錯誤' });
    }

    // ✅ 一定要 await
    const { sid } = await createSession(user.id);

    cookies.set(SESSION_COOKIE_NAME, sid, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS // ✅ 直接固定秒數最穩
    });
    const returnTo = url.searchParams.get('returnTo') ?? '/dashboard';
    throw redirect(303, returnTo);
  }
};
