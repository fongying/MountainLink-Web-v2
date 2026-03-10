import { redirect } from '@sveltejs/kit';
import { getDeviceState } from '$lib/server/device-telemetry';

export const load = async ({ locals, params, fetch }: any) => {
  if (!locals.user) throw redirect(303, '/login');

  const deviceId = params.id;
  const res = await fetch(`/api/history?deviceId=${encodeURIComponent(deviceId)}&limit=120`);
  const hist = res.ok ? await res.json() : { rows: [] };
  const device = await getDeviceState(deviceId);

  return {
    user: locals.user,
    deviceId,
    device,
    history: hist.rows ?? []
  };
};
