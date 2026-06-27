import { db } from '$lib/server/db';
import type { TripApplication } from '$lib/server/trip-applications';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RiskFactor = {
  category: string;
  label: string;
  score: number;
  severity: 'info' | 'warning' | 'danger';
};

export type RiskAssessment = {
  id: number;
  applicationId: number;
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  recommendations: string[];
  modelVersion: string;
  createdAt: string;
};

export type RiskQueueItem = {
  applicationId: number;
  userId: number;
  routeName: string;
  startDate: string;
  endDate: string;
  partySize: number;
  experienceLevel: string;
  meshtasticDeviceId: string;
  status: string;
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  recommendations: string[];
  assessedAt: string;
};

type RiskAssessmentRow = {
  id: number;
  application_id: number;
  score: number;
  level: RiskLevel;
  factors_json: string;
  recommendations_json: string;
  model_version: string;
  created_at: string;
};

type RiskQueueRow = {
  application_id: number;
  user_id: number;
  route_name: string;
  start_date: string;
  end_date: string;
  party_size: number;
  experience_level: string;
  meshtastic_device_id: string | null;
  status: string;
  score: number;
  level: RiskLevel;
  factors_json: string;
  recommendations_json: string;
  assessed_at: string;
};

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as any, (err) => (err ? reject(err) : resolve()));
  });
}

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

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function severityFromScore(score: number): RiskFactor['severity'] {
  if (score >= 20) return 'danger';
  if (score >= 10) return 'warning';
  return 'info';
}

function addFactor(factors: RiskFactor[], category: string, label: string, score: number) {
  if (score <= 0) return;
  factors.push({
    category,
    label,
    score,
    severity: severityFromScore(score)
  });
}

function hasEquipment(trip: TripApplication, item: string) {
  return trip.equipment.includes(item);
}

function uniqueRecommendations(items: string[]) {
  return [...new Set(items)];
}

export function calculateRiskAssessment(trip: TripApplication) {
  const factors: RiskFactor[] = [];
  const recommendations: string[] = [];

  const routeScores: Record<string, number> = {
    奇萊主北: 22,
    南湖大山: 24,
    北一段縱走北二段: 30,
    北二段: 26,
    屏風山: 18,
    閂山鈴鳴山: 18,
    畢祿縱走羊頭: 20,
    畢祿山: 14,
    羊頭山單攻: 16,
    清水山: 18,
    錐麓古道: 10,
    其他: 12
  };

  const routeScore = routeScores[trip.mainRoute] ?? 12;
  addFactor(factors, '路線', `${trip.mainRoute} 屬於需審慎規劃的山域路線。`, routeScore);
  if (routeScore >= 22) recommendations.push('建議管理者人工覆核路線計畫、撤退點與每日宿營安排。');

  if (trip.subRoute === '縱走') {
    addFactor(factors, '路線', '縱走路線撤退與補給難度較高。', 12);
    recommendations.push('請補充縱走段撤退路線、替代宿營點與補給安排。');
  }
  if (trip.subRoute === '單攻') {
    addFactor(factors, '時程', '單攻行程對體能、天候窗口與照明要求較高。', 10);
    recommendations.push('單攻行程需確認頭燈、備用電源與延誤下撤計畫。');
  }

  if (trip.totalDays >= 5) {
    addFactor(factors, '時程', `行程 ${trip.totalDays} 天，暴露於天候變化的時間較長。`, 14);
    recommendations.push('長天數行程建議每日回報定位與天候狀態。');
  } else if (trip.totalDays <= 1 && routeScore >= 16) {
    addFactor(factors, '時程', '中高風險路線安排單日行程，時間壓力偏高。', 12);
    recommendations.push('請確認單日行程的折返時間、下撤點與夜間行進準備。');
  }

  if (trip.partySize <= 1) {
    addFactor(factors, '隊伍', '單人行程缺少隊友互助與狀態交叉確認。', 18);
    recommendations.push('不建議單人前往中高風險路線，請增加同行隊員或提高通訊定位強度。');
  } else if (trip.partySize <= 2) {
    addFactor(factors, '隊伍', '隊伍人數偏少，事故時支援能力有限。', 8);
    recommendations.push('隊伍人數偏少時，建議留守人設定更密集的回報節點。');
  }

  if (trip.experienceLevel === '新手') {
    addFactor(factors, '隊伍', '隊伍經驗為新手，需降低路線與時程複雜度。', 18);
    recommendations.push('新手隊伍建議改選較短路線，或加入熟悉該路線的領隊。');
  } else if (trip.experienceLevel === '一般') {
    addFactor(factors, '隊伍', '隊伍經驗一般，仍需管理者確認裝備與路線規劃。', 8);
  }

  const requiredEquipment = ['保暖衣物', '雨具', '頭燈', '急救包', '離線地圖', '通訊定位設備'];
  const missingEquipment = requiredEquipment.filter((item) => !hasEquipment(trip, item));
  if (missingEquipment.length > 0) {
    addFactor(factors, '裝備', `缺少關鍵裝備：${missingEquipment.join('、')}。`, missingEquipment.length * 6);
    recommendations.push(`請補齊關鍵裝備：${missingEquipment.join('、')}。`);
  }

  if (!hasEquipment(trip, '備用電源')) {
    addFactor(factors, '裝備', '未勾選備用電源，通訊與定位續航存在風險。', 8);
    recommendations.push('請攜帶備用電源並確認手機、頭燈與通訊裝置可充電。');
  }

  const communicationChannels = [trip.meshtasticDeviceId, trip.satellitePhone, trip.radioFrequency].filter(Boolean).length;
  if (communicationChannels === 0) {
    addFactor(factors, '通訊', '未填寫 Meshtastic、衛星電話或無線電資訊。', 20);
    recommendations.push('請至少提供一種通訊或定位設備資訊，並交由留守人與管理者確認。');
  } else if (communicationChannels === 1) {
    addFactor(factors, '通訊', '僅提供一種通訊方式，備援能力有限。', 8);
    recommendations.push('建議補充第二種通訊方式，例如 Meshtastic 搭配無線電或衛星電話。');
  }

  if (trip.itinerary.trim().length < 30) {
    addFactor(factors, '計畫', '路線規劃描述偏短，難以判斷每日進度與撤退安排。', 12);
    recommendations.push('請補充每日行程、預計抵達時間、宿營點、撤退點與交通安排。');
  }

  if (!trip.stayBehindName || !trip.stayBehindMobile) {
    addFactor(factors, '留守', '留守人資料不完整。', 12);
    recommendations.push('請補齊留守人姓名、手機與 Email，並確認不上山。');
  }

  const score = Math.min(
    100,
    factors.reduce((sum, factor) => sum + factor.score, 0)
  );

  if (score < 30) {
    recommendations.push('目前資料顯示風險偏低，仍需在出發前確認天候、裝備與通訊狀態。');
  }

  return {
    score,
    level: levelFromScore(score),
    factors,
    recommendations: uniqueRecommendations(recommendations)
  };
}

function rowToAssessment(row: RiskAssessmentRow): RiskAssessment {
  return {
    id: row.id,
    applicationId: row.application_id,
    score: row.score,
    level: row.level,
    factors: parseJsonArray<RiskFactor>(row.factors_json),
    recommendations: parseJsonArray<string>(row.recommendations_json),
    modelVersion: row.model_version,
    createdAt: row.created_at
  };
}

function rowToRiskQueueItem(row: RiskQueueRow): RiskQueueItem {
  return {
    applicationId: row.application_id,
    userId: row.user_id,
    routeName: row.route_name,
    startDate: row.start_date,
    endDate: row.end_date,
    partySize: row.party_size,
    experienceLevel: row.experience_level,
    meshtasticDeviceId: row.meshtastic_device_id ?? '',
    status: row.status,
    score: row.score,
    level: row.level,
    factors: parseJsonArray<RiskFactor>(row.factors_json),
    recommendations: parseJsonArray<string>(row.recommendations_json),
    assessedAt: row.assessed_at
  };
}

export async function createRiskAssessmentForTrip(trip: TripApplication) {
  const assessment = calculateRiskAssessment(trip);

  await run(`DELETE FROM risk_assessments WHERE application_id = ?`, [trip.id]);
  const id = await runInsert(
    `INSERT INTO risk_assessments (
      application_id, score, level, factors_json, recommendations_json, model_version
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      trip.id,
      assessment.score,
      assessment.level,
      JSON.stringify(assessment.factors),
      JSON.stringify(assessment.recommendations),
      'rules-v1'
    ]
  );

  return {
    id,
    applicationId: trip.id,
    score: assessment.score,
    level: assessment.level,
    factors: assessment.factors,
    recommendations: assessment.recommendations,
    modelVersion: 'rules-v1',
    createdAt: new Date().toISOString()
  };
}

export async function getLatestRiskAssessment(applicationId: number) {
  const row = await getOne<RiskAssessmentRow>(
    `SELECT *
     FROM risk_assessments
     WHERE application_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [applicationId]
  );
  return row ? rowToAssessment(row) : null;
}

export async function listRiskQueue(options: { userId?: number; includeAll?: boolean; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50));
  const userFilter = options.includeAll ? '' : 'AND t.user_id = ?';
  const params: unknown[] = options.includeAll ? [limit] : [options.userId, limit];

  const rows = await getAll<RiskQueueRow>(
    `SELECT
       t.id AS application_id,
       t.user_id,
       t.route_name,
       t.start_date,
       t.end_date,
       t.party_size,
       t.experience_level,
       t.meshtastic_device_id,
       t.status,
       r.score,
       r.level,
       r.factors_json,
       r.recommendations_json,
       r.created_at AS assessed_at
     FROM trip_applications t
     JOIN risk_assessments r ON r.application_id = t.id
     WHERE r.id = (
       SELECT r2.id
       FROM risk_assessments r2
       WHERE r2.application_id = t.id
       ORDER BY r2.created_at DESC, r2.id DESC
       LIMIT 1
     )
     ${userFilter}
     ORDER BY
       CASE r.level
         WHEN 'critical' THEN 4
         WHEN 'high' THEN 3
         WHEN 'medium' THEN 2
         ELSE 1
       END DESC,
       r.score DESC,
       t.start_date ASC
     LIMIT ?`,
    params
  );

  return rows.map(rowToRiskQueueItem);
}
