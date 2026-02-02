import type { Handle } from '@sveltejs/kit';
import { getUserBySessionId, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const sid = event.cookies.get(SESSION_COOKIE_NAME);
  //console.log('SID=', sid); // ✅ 暫時除錯用
  event.locals.user = sid ? await getUserBySessionId(sid) : null;
  //console.log('USER=', event.locals.user); // ✅ 暫時除錯用
  return resolve(event);
};

