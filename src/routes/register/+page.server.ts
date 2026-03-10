import { fail, redirect } from '@sveltejs/kit';
import { countUsers, createUser } from '$lib/server/auth';

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('unique');
}

export const load = async () => {
  // Public registration is allowed.
  return {};
};

export const actions = {
  default: async ({ request }: { request: Request }) => {
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (username.length < 3) {
      return fail(400, { error: '使用者名稱至少需要 3 個字元。' });
    }
    if (password.length < 8) {
      return fail(400, { error: '密碼至少需要 8 個字元。' });
    }

    const total = await countUsers();
    const isAdmin = total === 0 ? 1 : 0;

    try {
      await createUser(username, password, isAdmin);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return fail(409, { error: '此使用者名稱已存在，請更換。' });
      }
      return fail(500, { error: '建立帳號失敗，請稍後再試。' });
    }

    // After successful registration, go to login.
    throw redirect(303, '/login');
  }
};

