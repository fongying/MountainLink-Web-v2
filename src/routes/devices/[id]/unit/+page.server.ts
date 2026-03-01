import { fail, redirect } from '@sveltejs/kit';
import { getMockDeviceUnit, getMockDevices, setMockDeviceUnit } from '$lib/server/mock';
import { listUsers } from '$lib/server/auth';
import { getDeviceBinding, setDeviceBinding } from '$lib/server/device-bindings';
import { getDeviceUnit, setDeviceUnit } from '$lib/server/device-units';

const UNITS = ['登山者', '待救者', '特種搜救隊(NFA SSRT)', '警消', '志工'] as const;

export const load = async ({ locals, params }: { locals: App.Locals; params: { id: string } }) => {
  if (!locals.user) throw redirect(303, '/login');
  if (!locals.user.is_admin) throw redirect(303, '/dashboard');
  const currentUser = locals.user;

  const deviceId = params.id;
  const exists = getMockDevices().some((d) => d.deviceId === deviceId);
  if (!exists) throw redirect(303, '/dashboard');

  const users = await listUsers();
  const otherUsers = users.filter((u) => u.id !== currentUser.id);

  return {
    deviceId,
    unit: (await getDeviceUnit(deviceId)) ?? getMockDeviceUnit(deviceId) ?? '登山者',
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
    if (!UNITS.includes(unit as any)) {
      return fail(400, { error: '單位不正確' });
    }
    if (bindUserIdRaw && !Number.isFinite(bindUserId)) {
      return fail(400, { error: '綁定帳號不正確' });
    }

    if (bindUserId != null) {
      const users = await listUsers();
      const exists = users.some((u) => u.id === bindUserId);
      if (!exists) return fail(400, { error: '綁定帳號不存在' });
    }

    await setDeviceUnit(params.id, unit);
    setMockDeviceUnit(params.id, unit); // keep mock in sync for UI
    await setDeviceBinding(params.id, bindUserId);
    throw redirect(303, `/devices/${encodeURIComponent(params.id)}`);
  }
};
