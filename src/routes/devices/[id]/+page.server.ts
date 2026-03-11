import { redirect } from '@sveltejs/kit';
import { getDeviceLabel } from '$lib/server/device-labels';
import { getDeviceState } from '$lib/server/device-telemetry';
import { getDeviceUnit } from '$lib/server/device-units';

export const load = async ({ locals, params, fetch }: any) => {
  if (!locals.user) throw redirect(303, '/login');

  const deviceId = params.id;
  const res = await fetch(`/api/history?deviceId=${encodeURIComponent(deviceId)}&limit=120`);
  const hist = res.ok ? await res.json() : { rows: [] };
  const rawDevice = await getDeviceState(deviceId);
  const device = rawDevice
    ? {
        ...rawDevice,
        displayName: (await getDeviceLabel(deviceId)) ?? rawDevice.displayName,
        unit: (await getDeviceUnit(deviceId)) ?? rawDevice.unit
      }
    : null;

  return {
    user: locals.user,
    deviceId,
    device,
    history: hist.rows ?? []
  };
};
