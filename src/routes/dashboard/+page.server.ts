import { redirect } from '@sveltejs/kit';
import { getMockDevices } from '$lib/server/mock';
import { listDeviceUnits } from '$lib/server/device-units';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  const units = await listDeviceUnits();
  const devices = getMockDevices().map((d) => ({
    ...d,
    unit: units.get(d.deviceId)
  }));

  return {
    user: locals.user,
    devices
  };
};
