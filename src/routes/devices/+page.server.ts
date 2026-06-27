import { redirect } from '@sveltejs/kit';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceUnits } from '$lib/server/device-units';

export const load = async ({ locals }: any) => {
  if (!locals.user) throw redirect(303, '/login');

  const [devices, labels, units] = await Promise.all([
    listDeviceStates(),
    listDeviceLabels(),
    listDeviceUnits()
  ]);

  return {
    user: locals.user,
    devices: devices.map((device) => ({
      ...device,
      displayName: labels.get(device.deviceId) ?? device.displayName,
      unit: units.get(device.deviceId) ?? device.unit
    }))
  };
};
