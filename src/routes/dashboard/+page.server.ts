import { redirect } from '@sveltejs/kit';
import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceUnits } from '$lib/server/device-units';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  const units = await listDeviceUnits();
  const devices = (await listDeviceStates()).map((d) => ({
    ...d,
    unit: units.get(d.deviceId) ?? d.unit
  }));

  return {
    user: locals.user,
    devices
  };
};
