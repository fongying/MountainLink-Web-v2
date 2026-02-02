import { fail, redirect } from '@sveltejs/kit';
import { countUsers, createUser } from '$lib/server/auth';

export const load = async ({ locals }: { locals: App.Locals }) => {
  const total = await countUsers();

  // ✅ 已有使用者：只有 admin 可以進註冊頁
  if (total > 0 && !locals.user?.is_admin) {
    throw redirect(303, '/login');
  }

  return {};
};

export const actions = {
  default: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (username.length < 3) return fail(400, { error: '帳號至少 3 個字元' });
    if (password.length < 8) return fail(400, { error: '密碼至少 8 個字元' });

    const total = await countUsers();

    // ✅ 情境 1：首次啟動（沒有任何使用者）→ 允許註冊，且第一個變 admin
    if (total === 0) {
      try {
        await createUser(username, password, 1);
        throw redirect(303, '/login');
      } catch {
        return fail(409, { error: '帳號已存在' });
      }
    }

    // ✅ 情境 2：已有使用者 → 只能 admin 新增帳號
    if (!locals.user?.is_admin) {
      return fail(403, { error: '註冊已關閉，請由管理員新增帳號' });
    }

    try {
      await createUser(username, password, 0);
      // admin 建好帳號後可以留在 /register 或導回 dashboard
      throw redirect(303, '/dashboard');
    } catch {
      return fail(409, { error: '帳號已存在' });
    }
  }
};
