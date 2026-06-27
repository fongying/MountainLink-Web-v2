import { redirect } from '@sveltejs/kit';
import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceUnits } from '$lib/server/device-units';
import { listRiskQueue } from '$lib/server/risk-assessments';
import { getLatestAiRecommendation } from '$lib/server/ai-agent';

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  const labels = await listDeviceLabels();
  const units = await listDeviceUnits();
  const devices = (await listDeviceStates()).map((d) => ({
    ...d,
    displayName: labels.get(d.deviceId) ?? d.displayName,
    unit: units.get(d.deviceId) ?? d.unit
  }));
  const riskQueue = await listRiskQueue({
    userId: locals.user.id,
    includeAll: Boolean(locals.user.is_admin),
    limit: 12
  });
  const aiRecommendation = await getLatestAiRecommendation();

  return {
    user: locals.user,
    devices,
    riskQueue,
    aiRecommendation
  };
};
