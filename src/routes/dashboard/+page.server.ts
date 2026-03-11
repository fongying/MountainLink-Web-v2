import { redirect } from '@sveltejs/kit';
import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceUnits } from '$lib/server/device-units';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  const labels = await listDeviceLabels();
  const units = await listDeviceUnits();
  const devices = (await listDeviceStates()).map((d) => ({
    ...d,
    displayName: labels.get(d.deviceId) ?? d.displayName,
    unit: units.get(d.deviceId) ?? d.unit
  }));

  return {
    user: locals.user,
    devices
  };
};
