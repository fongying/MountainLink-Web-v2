import { error, redirect } from '@sveltejs/kit';
import { getDeviceState } from '$lib/server/device-telemetry';
import { getDeviceLabel } from '$lib/server/device-labels';
import { getDevicePlayback } from '$lib/server/playback';
export const load = async ({ locals, params }: any) => {
  if (!locals.user) throw redirect(303, '/login');
  const device = await getDeviceState(params.id);
  if (!device) throw error(404, '找不到裝置');
  const name = (await getDeviceLabel(params.id)) || device.displayName || params.id;
  return { playback: await getDevicePlayback(params.id,name) };
};
