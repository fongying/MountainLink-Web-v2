import { db } from '$lib/server/db';

export type TripApplicationInput = {
  userId: number;
  mainRoute: string;
  subRoute: string;
  totalDays: number;
  startDate: string;
  endDate: string;
  entryArea: string;
  exitArea: string;
  itinerary: string;
  satellitePhone?: string;
  radioFrequency?: string;
  partySize: number;
  experienceLevel: string;
  equipment: string[];
  applicantName: string;
  applicantMobile: string;
  applicantEmail: string;
  leaderName: string;
  leaderMobile: string;
  leaderEmail: string;
  teamMembersText?: string;
  stayBehindName: string;
  stayBehindPhone?: string;
  stayBehindMobile: string;
  stayBehindEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  meshtasticDeviceId?: string;
  notes?: string;
  agreementConfirmed: boolean;
};

export type TripApplication = {
  id: number;
  userId: number;
  routeName: string;
  mainRoute: string;
  subRoute: string;
  totalDays: number;
  startDate: string;
  endDate: string;
  entryArea: string;
  exitArea: string;
  itinerary: string;
  satellitePhone: string;
  radioFrequency: string;
  partySize: number;
  experienceLevel: string;
  equipment: string[];
  applicantName: string;
  applicantMobile: string;
  applicantEmail: string;
  leaderName: string;
  leaderMobile: string;
  leaderEmail: string;
  teamMembersText: string;
  stayBehindName: string;
  stayBehindPhone: string;
  stayBehindMobile: string;
  stayBehindEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  meshtasticDeviceId: string;
  notes: string;
  agreementConfirmed: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type TripApplicationRow = {
  id: number;
  user_id: number;
  route_name: string;
  main_route: string | null;
  sub_route: string | null;
  total_days: number | null;
  start_date: string;
  end_date: string;
  entry_area: string | null;
  exit_area: string | null;
  itinerary: string | null;
  satellite_phone: string | null;
  radio_frequency: string | null;
  party_size: number;
  experience_level: string;
  equipment_json: string;
  applicant_name: string | null;
  applicant_mobile: string | null;
  applicant_email: string | null;
  leader_name: string | null;
  leader_mobile: string | null;
  leader_email: string | null;
  team_members_text: string | null;
  stay_behind_name: string | null;
  stay_behind_phone: string | null;
  stay_behind_mobile: string | null;
  stay_behind_email: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  meshtastic_device_id: string | null;
  notes: string | null;
  agreement_confirmed: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function runInsert(sql: string, params: unknown[] = []) {
  return new Promise<number>((resolve, reject) => {
    db.run(sql, params as any, function (err) {
      if (err) return reject(err);
      resolve(this?.lastID ?? 0);
    });
  });
}

function getOne<T>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params as any, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function getAll<T>(sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params as any, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

function parseEquipment(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rowToTrip(row: TripApplicationRow): TripApplication {
  return {
    id: row.id,
    userId: row.user_id,
    routeName: row.route_name,
    mainRoute: row.main_route ?? row.route_name,
    subRoute: row.sub_route ?? '',
    totalDays: row.total_days ?? 0,
    startDate: row.start_date,
    endDate: row.end_date,
    entryArea: row.entry_area ?? '',
    exitArea: row.exit_area ?? '',
    itinerary: row.itinerary ?? '',
    satellitePhone: row.satellite_phone ?? '',
    radioFrequency: row.radio_frequency ?? '',
    partySize: row.party_size,
    experienceLevel: row.experience_level,
    equipment: parseEquipment(row.equipment_json),
    applicantName: row.applicant_name ?? '',
    applicantMobile: row.applicant_mobile ?? '',
    applicantEmail: row.applicant_email ?? '',
    leaderName: row.leader_name ?? '',
    leaderMobile: row.leader_mobile ?? '',
    leaderEmail: row.leader_email ?? '',
    teamMembersText: row.team_members_text ?? '',
    stayBehindName: row.stay_behind_name ?? '',
    stayBehindPhone: row.stay_behind_phone ?? '',
    stayBehindMobile: row.stay_behind_mobile ?? '',
    stayBehindEmail: row.stay_behind_email ?? '',
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    meshtasticDeviceId: row.meshtastic_device_id ?? '',
    notes: row.notes ?? '',
    agreementConfirmed: Boolean(row.agreement_confirmed),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createTripApplication(input: TripApplicationInput) {
  const routeName = input.subRoute ? `${input.mainRoute} - ${input.subRoute}` : input.mainRoute;

  return runInsert(
    `INSERT INTO trip_applications (
      user_id, route_name, main_route, sub_route, total_days, start_date, end_date,
      entry_area, exit_area, itinerary, satellite_phone, radio_frequency,
      party_size, experience_level, equipment_json,
      applicant_name, applicant_mobile, applicant_email,
      leader_name, leader_mobile, leader_email, team_members_text,
      stay_behind_name, stay_behind_phone, stay_behind_mobile, stay_behind_email,
      emergency_contact_name, emergency_contact_phone, meshtastic_device_id,
      notes, agreement_confirmed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      routeName,
      input.mainRoute,
      input.subRoute || null,
      input.totalDays,
      input.startDate,
      input.endDate,
      input.entryArea,
      input.exitArea,
      input.itinerary,
      input.satellitePhone || null,
      input.radioFrequency || null,
      input.partySize,
      input.experienceLevel,
      JSON.stringify(input.equipment),
      input.applicantName,
      input.applicantMobile,
      input.applicantEmail,
      input.leaderName,
      input.leaderMobile,
      input.leaderEmail,
      input.teamMembersText || null,
      input.stayBehindName,
      input.stayBehindPhone || null,
      input.stayBehindMobile,
      input.stayBehindEmail,
      input.emergencyContactName,
      input.emergencyContactPhone,
      input.meshtasticDeviceId || null,
      input.notes || null,
      input.agreementConfirmed ? 1 : 0
    ]
  );
}

export async function listTripApplicationsForUser(userId: number) {
  const rows = await getAll<TripApplicationRow>(
    `SELECT *
     FROM trip_applications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 8`,
    [userId]
  );
  return rows.map(rowToTrip);
}

export async function getTripApplicationForUser(id: number, userId: number, isAdmin: boolean) {
  const row = await getOne<TripApplicationRow>(
    `SELECT *
     FROM trip_applications
     WHERE id = ? AND (? = 1 OR user_id = ?)`,
    [id, isAdmin ? 1 : 0, userId]
  );
  return row ? rowToTrip(row) : null;
}
