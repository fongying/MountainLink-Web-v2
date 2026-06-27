import { redirect } from '@sveltejs/kit';
import { getTripApplicationForUser } from '$lib/server/trip-applications';
import { createRiskAssessmentForTrip, getLatestRiskAssessment } from '$lib/server/risk-assessments';

export const load = async ({ locals, params }: { locals: App.Locals; params: { id: string } }) => {
  if (!locals.user) throw redirect(303, '/login');

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) throw redirect(303, '/apply');

  const trip = await getTripApplicationForUser(id, locals.user.id, Boolean(locals.user.is_admin));
  if (!trip) throw redirect(303, '/apply');
  const assessment = (await getLatestRiskAssessment(trip.id)) ?? (await createRiskAssessmentForTrip(trip));

  return {
    user: locals.user,
    trip,
    assessment
  };
};
