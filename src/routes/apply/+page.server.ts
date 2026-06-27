import { fail, redirect } from '@sveltejs/kit';
import {
  createTripApplication,
  getTripApplicationForUser,
  listTripApplicationsForUser
} from '$lib/server/trip-applications';
import { createRiskAssessmentForTrip } from '$lib/server/risk-assessments';

const MAIN_ROUTE_OPTIONS = [
  '奇萊主北',
  '南湖大山',
  '北一段縱走北二段',
  '北二段',
  '屏風山',
  '閂山鈴鳴山',
  '畢祿縱走羊頭',
  '畢祿山',
  '羊頭山單攻',
  '清水山',
  '錐麓古道',
  '其他'
] as const;

const SUB_ROUTE_OPTIONS = [
  '主峰',
  '北峰',
  '東峰',
  '西峰',
  '南峰',
  '縱走',
  '單攻',
  '原路折返',
  '其他'
] as const;

const AREA_OPTIONS = [
  '松雪樓登山口',
  '合歡山莊',
  '大禹嶺',
  '慈恩登山口',
  '勝光登山口',
  '思源埡口',
  '710 林道口',
  '仁壽橋',
  '太魯閣遊客中心',
  '錐麓吊橋',
  '其他'
] as const;

const EQUIPMENT_OPTIONS = [
  '保暖衣物',
  '雨具',
  '頭燈',
  '行動糧',
  '急救包',
  '離線地圖',
  '通訊定位設備',
  '備用電源',
  '安全帽',
  '登山計畫書'
] as const;

const EXPERIENCE_LEVELS = ['新手', '一般', '熟練', '嚮導/救援經驗'] as const;

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
}

function daysBetween(startDate: string, endDate: string) {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function clean(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhoneLike(value: string) {
  return /^[0-9+\-\s()]{6,20}$/.test(value);
}

function normalizePersonValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function samePerson(
  a: { name: string; mobile?: string; email?: string },
  b: { name: string; mobile?: string; email?: string }
) {
  const aName = normalizePersonValue(a.name);
  const bName = normalizePersonValue(b.name);
  const aMobile = normalizePersonValue(a.mobile ?? '');
  const bMobile = normalizePersonValue(b.mobile ?? '');
  const aEmail = normalizePersonValue(a.email ?? '');
  const bEmail = normalizePersonValue(b.email ?? '');

  return Boolean(
    (aName && bName && aName === bName) ||
      (aMobile && bMobile && aMobile === bMobile) ||
      (aEmail && bEmail && aEmail === bEmail)
  );
}

function teamMembersContainStayBehind(teamMembersText: string, stayBehind: { name: string; mobile: string; email: string }) {
  const text = normalizePersonValue(teamMembersText);
  if (!text) return false;
  return [stayBehind.name, stayBehind.mobile, stayBehind.email].some((value) => {
    const normalized = normalizePersonValue(value);
    return normalized.length >= 2 && text.includes(normalized);
  });
}

export const load = async ({ locals }: { locals: App.Locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  return {
    user: locals.user,
    mainRouteOptions: MAIN_ROUTE_OPTIONS,
    subRouteOptions: SUB_ROUTE_OPTIONS,
    areaOptions: AREA_OPTIONS,
    equipmentOptions: EQUIPMENT_OPTIONS,
    experienceLevels: EXPERIENCE_LEVELS,
    recentTrips: await listTripApplicationsForUser(locals.user.id)
  };
};

export const actions = {
  default: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const mainRoute = clean(form, 'mainRoute');
    const subRoute = clean(form, 'subRoute');
    const totalDays = Number(form.get('totalDays') ?? 0);
    const startDate = clean(form, 'startDate');
    const endDate = clean(form, 'endDate');
    const entryArea = clean(form, 'entryArea');
    const exitArea = clean(form, 'exitArea');
    const itinerary = clean(form, 'itinerary');
    const satellitePhone = clean(form, 'satellitePhone');
    const radioFrequency = clean(form, 'radioFrequency');
    const partySize = Number(form.get('partySize') ?? 0);
    const experienceLevel = clean(form, 'experienceLevel');
    const equipment = form.getAll('equipment').map((item) => String(item));
    const applicantName = clean(form, 'applicantName');
    const applicantMobile = clean(form, 'applicantMobile');
    const applicantEmail = clean(form, 'applicantEmail');
    const leaderName = clean(form, 'leaderName');
    const leaderMobile = clean(form, 'leaderMobile');
    const leaderEmail = clean(form, 'leaderEmail');
    const teamMembersText = clean(form, 'teamMembersText');
    const stayBehindName = clean(form, 'stayBehindName');
    const stayBehindPhone = clean(form, 'stayBehindPhone');
    const stayBehindMobile = clean(form, 'stayBehindMobile');
    const stayBehindEmail = clean(form, 'stayBehindEmail');
    const emergencyContactName = clean(form, 'emergencyContactName');
    const emergencyContactPhone = clean(form, 'emergencyContactPhone');
    const meshtasticDeviceId = clean(form, 'meshtasticDeviceId');
    const notes = clean(form, 'notes');
    const agreementConfirmed = form.get('agreementConfirmed') === 'on';

    const values = {
      mainRoute,
      subRoute,
      totalDays: Number.isFinite(totalDays) && totalDays > 0 ? String(totalDays) : '',
      startDate,
      endDate,
      entryArea,
      exitArea,
      itinerary,
      satellitePhone,
      radioFrequency,
      partySize: Number.isFinite(partySize) && partySize > 0 ? String(partySize) : '',
      experienceLevel,
      equipment,
      applicantName,
      applicantMobile,
      applicantEmail,
      leaderName,
      leaderMobile,
      leaderEmail,
      teamMembersText,
      stayBehindName,
      stayBehindPhone,
      stayBehindMobile,
      stayBehindEmail,
      emergencyContactName,
      emergencyContactPhone,
      meshtasticDeviceId,
      notes,
      agreementConfirmed
    };

    if (!MAIN_ROUTE_OPTIONS.includes(mainRoute as (typeof MAIN_ROUTE_OPTIONS)[number])) {
      return fail(400, { error: '請選擇登山主路線。', values });
    }
    if (!SUB_ROUTE_OPTIONS.includes(subRoute as (typeof SUB_ROUTE_OPTIONS)[number])) {
      return fail(400, { error: '請選擇次路線。', values });
    }
    if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > 30) {
      return fail(400, { error: '登山總日數需介於 1 到 30 天。', values });
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return fail(400, { error: '請填寫有效的入園與離園日期。', values });
    }
    if (Date.parse(endDate) < Date.parse(startDate)) {
      return fail(400, { error: '離園日期不可早於入園日期。', values });
    }
    if (Math.abs(daysBetween(startDate, endDate) - totalDays) > 1) {
      return fail(400, { error: '登山總日數需與入園、離園日期大致一致。', values });
    }
    if (!AREA_OPTIONS.includes(entryArea as (typeof AREA_OPTIONS)[number])) {
      return fail(400, { error: '請選擇入山地點。', values });
    }
    if (!AREA_OPTIONS.includes(exitArea as (typeof AREA_OPTIONS)[number])) {
      return fail(400, { error: '請選擇離山地點。', values });
    }
    if (itinerary.length < 10) return fail(400, { error: '請填寫簡易路線規劃，至少 10 個字。', values });
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 12) {
      return fail(400, { error: '隊伍人數需介於 1 到 12 人。', values });
    }
    if (!EXPERIENCE_LEVELS.includes(experienceLevel as (typeof EXPERIENCE_LEVELS)[number])) {
      return fail(400, { error: '請選擇隊伍經驗程度。', values });
    }
    if (!applicantName || !isPhoneLike(applicantMobile) || !isEmail(applicantEmail)) {
      return fail(400, { error: '請完整填寫申請人姓名、手機與 Email。', values });
    }
    if (!leaderName || !isPhoneLike(leaderMobile) || !isEmail(leaderEmail)) {
      return fail(400, { error: '請完整填寫領隊姓名、手機與 Email。', values });
    }
    if (!stayBehindName || !isPhoneLike(stayBehindMobile) || !isEmail(stayBehindEmail)) {
      return fail(400, { error: '請完整填寫留守人姓名、手機與 Email。', values });
    }
    if (
      samePerson(
        { name: stayBehindName, mobile: stayBehindMobile, email: stayBehindEmail },
        { name: leaderName, mobile: leaderMobile, email: leaderEmail }
      )
    ) {
      return fail(400, { error: '留守人不能同時擔任領隊，請改填不上山的留守人。', values });
    }
    if (teamMembersContainStayBehind(teamMembersText, { name: stayBehindName, mobile: stayBehindMobile, email: stayBehindEmail })) {
      return fail(400, { error: '留守人不能出現在隊員名單中，請改填不上山的家人或聯絡人。', values });
    }
    if (!emergencyContactName || !isPhoneLike(emergencyContactPhone)) {
      return fail(400, { error: '請填寫緊急聯絡人與有效電話。', values });
    }
    if (equipment.length < 3) return fail(400, { error: '請至少勾選 3 項安全整備。', values });
    if (!agreementConfirmed) return fail(400, { error: '送出前需確認安全與環境維護承諾。', values });

    const id = await createTripApplication({
      userId: locals.user.id,
      mainRoute,
      subRoute,
      totalDays,
      startDate,
      endDate,
      entryArea,
      exitArea,
      itinerary,
      satellitePhone,
      radioFrequency,
      partySize,
      experienceLevel,
      equipment,
      applicantName,
      applicantMobile,
      applicantEmail,
      leaderName,
      leaderMobile,
      leaderEmail,
      teamMembersText,
      stayBehindName,
      stayBehindPhone,
      stayBehindMobile,
      stayBehindEmail,
      emergencyContactName,
      emergencyContactPhone,
      meshtasticDeviceId,
      notes,
      agreementConfirmed
    });
    const trip = await getTripApplicationForUser(id, locals.user.id, Boolean(locals.user.is_admin));
    if (trip) await createRiskAssessmentForTrip(trip);

    throw redirect(303, `/apply/${id}`);
  }
};
