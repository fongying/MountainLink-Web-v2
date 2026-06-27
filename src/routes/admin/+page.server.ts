import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');
  if (!locals.user.is_admin) throw redirect(303, '/dashboard');

  return {
    user: locals.user
  };
};
