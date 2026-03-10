import { fail, redirect } from '@sveltejs/kit';
import { listUsers } from '$lib/server/auth';
import { getDeviceBinding, setDeviceBinding } from '$lib/server/device-bindings';
import { getDeviceState } from '$lib/server/device-telemetry';
import { getDeviceUnit, setDeviceUnit } from '$lib/server/device-units';

const UNITS = ['登山者', '待救者', '特種搜救隊(NFA SSRT)', '警消', '志工'] as const;

export const load = async ({ locals, params }: { locals: App.Locals; params: { id: string } }) => {
  if (!locals.user) throw redirect(303, '/login');
  if (!locals.user.is_admin) throw redirect(303, '/dashboard');

  const deviceId = params.id;
  const device = await getDeviceState(deviceId);
  if (!device) throw redirect(303, '/dashboard');

  const currentUser = locals.user;
  const users = await listUsers();
  const otherUsers = users.filter((user) => user.id !== currentUser.id);

  return {
    deviceId,
    unit: (await getDeviceUnit(deviceId)) ?? device.unit ?? '登山者',
    units: UNITS,
    users: otherUsers,
    boundUserId: await getDeviceBinding(deviceId)
  };
};

export const actions = {
  default: async ({ request, locals, params }: { request: Request; locals: App.Locals; params: { id: string } }) => {
    if (!locals.user) throw redirect(303, '/login');
    if (!locals.user.is_admin) throw redirect(303, '/dashboard');

    const form = await request.formData();
    const unit = String(form.get('unit') ?? '').trim();
    const bindUserIdRaw = String(form.get('bindUserId') ?? '').trim();
    const bindUserId = bindUserIdRaw ? Number(bindUserIdRaw) : null;

    if (!UNITS.includes(unit as (typeof UNITS)[number])) {
      return fail(400, { error: '單位類型無效。' });
    }
    if (bindUserIdRaw && !Number.isFinite(bindUserId)) {
      return fail(400, { error: '綁定帳號格式無效。' });
    }

    if (bindUserId != null) {
      const users = await listUsers();
      const exists = users.some((user) => user.id === bindUserId);
      if (!exists) {
        return fail(400, { error: '綁定帳號不存在。' });
      }
    }

    await setDeviceUnit(params.id, unit);
    await setDeviceBinding(params.id, bindUserId);
    throw redirect(303, `/devices/${encodeURIComponent(params.id)}`);
  }
};

