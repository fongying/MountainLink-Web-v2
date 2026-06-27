import { createHash, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type {
  AiFocusedTeamContext,
  AiRecommendation,
  AiRecommendationEvidence,
  AiRecommendationSeverity,
  AiRecommendationStatus,
  DeviceTelemetry,
  MountainForecastLocation
} from '$lib/types';
import type { AlertItem } from '$lib/types/alerts';
import { isMountainArea } from '$lib/mountain-areas';
import { getUnifiedHazardSnapshot } from '$lib/server/hazards';
import { getMountainForecastSnapshotCached } from '$lib/server/forecast';
import { listDeviceStates } from '$lib/server/device-telemetry';
import { listDeviceLabels } from '$lib/server/device-labels';
import { listDeviceUnits } from '$lib/server/device-units';
import { db } from '$lib/server/db';
import { dispatchAiRecommendation } from '$lib/server/ai-dispatch';
import { generateOllamaJson, isOllamaConfigured, ollamaModel } from '$lib/server/ollama-client';
import { generateNvidiaJson, isNvidiaConfigured, nvidiaModel } from '$lib/server/nvidia-client';
import { buildTerrainSummary, type TerrainSummary } from '$lib/server/terrain-context';
import { broadcastSse } from '$lib/server/stream';

type AiRecommendationRow = {
  id: string;
  status: AiRecommendationStatus;
  severity: AiRecommendationSeverity;
  title: string;
  reasoning_summary: string;
  recommended_action: string;
  message: string;
  target_areas_json: string;
  global_summary: string | null;
  focus_device_id: string | null;
  team_context_json: string | null;
  evidence_json: string;
  validation_errors_json: string;
  fingerprint: string;
  provider: 'ollama' | 'nvidia';
  model: string;
  generated_at: string;
  dispatched_at: string | null;
  dispatch_error: string | null;
};

type AgentEvidence = AiRecommendationEvidence & {
  area?: string;
  severity?: AiRecommendationSeverity;
};

type TeamRiskContext = {
  deviceId: string;
  name: string;
  unit?: string;
  score: number;
  riskReasons: string[];
  online: boolean;
  sos?: boolean;
  battery: number;
  charging?: boolean;
  lat?: number;
  lon?: number;
  alt?: number;
  updatedAt: number;
  staleMinutes: number;
  rssi?: number;
  snr?: number;
  physiologicalAbnormalities: string[];
  terrain: TerrainSummary;
};

type LlmRecommendation = {
  severity?: string;
  send?: boolean;
  title?: string;
  targetAreas?: string[];
  riskType?: string[];
  globalSummary?: string;
  focusDeviceId?: string;
  teamSituationSummary?: string;
  terrainSummary?: string;
  physiologySummary?: string;
  operatorRecommendation?: string;
  reasoningSummary?: string;
  recommendedAction?: string;
  evidenceIds?: string[];
  meshtasticDraft?: string;
  message?: string;
};

type AgentSnapshot = {
  hazards: AlertItem[];
  forecastLocations: MountainForecastLocation[];
  devices: DeviceTelemetry[];
  teamRiskContext: TeamRiskContext[];
  focusTeam?: TeamRiskContext;
  evidence: AgentEvidence[];
  forecastError?: string;
};

const AI_RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['info', 'watch', 'warning', 'critical'] },
    send: { type: 'boolean' },
    title: { type: 'string' },
    targetAreas: { type: 'array', items: { type: 'string' } },
    riskType: { type: 'array', items: { type: 'string' } },
    globalSummary: { type: 'string' },
    focusDeviceId: { type: 'string' },
    teamSituationSummary: { type: 'string' },
    terrainSummary: { type: 'string' },
    physiologySummary: { type: 'string' },
    operatorRecommendation: { type: 'string' },
    reasoningSummary: { type: 'string' },
    recommendedAction: { type: 'string' },
    evidenceIds: { type: 'array', items: { type: 'string' } },
    meshtasticDraft: { type: 'string' },
    message: { type: 'string' }
  },
  required: [
    'severity',
    'send',
    'title',
    'targetAreas',
    'riskType',
    'globalSummary',
    'focusDeviceId',
    'teamSituationSummary',
    'terrainSummary',
    'physiologySummary',
    'operatorRecommendation',
    'reasoningSummary',
    'recommendedAction',
    'evidenceIds',
    'meshtasticDraft',
    'message'
  ]
};

let runInFlight: Promise<AiRecommendation> | null = null;

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

function run(sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, params as any, (err) => (err ? reject(err) : resolve()));
  });
}

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[]) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject<T>(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

function rowToRecommendation(row: AiRecommendationRow): AiRecommendation {
  return {
    id: row.id,
    status: row.status,
    severity: row.severity,
    title: row.title,
    reasoningSummary: row.reasoning_summary,
    recommendedAction: row.recommended_action,
    message: row.message,
    targetAreas: parseJsonArray<string>(row.target_areas_json, []),
    globalSummary: row.global_summary ?? undefined,
    focusDeviceId: row.focus_device_id ?? undefined,
    teamContext: parseJsonObject<AiFocusedTeamContext>(row.team_context_json),
    evidence: parseJsonArray<AiRecommendationEvidence>(row.evidence_json, []),
    validationErrors: parseJsonArray<string>(row.validation_errors_json, []),
    fingerprint: row.fingerprint,
    provider: row.provider,
    model: row.model,
    generatedAt: row.generated_at,
    dispatchedAt: row.dispatched_at ?? undefined,
    dispatchError: row.dispatch_error ?? undefined
  };
}
const AI_SELECT_FIELDS = `
  id, status, severity, title, reasoning_summary, recommended_action, message,
  target_areas_json, global_summary, focus_device_id, team_context_json,
  evidence_json, validation_errors_json, fingerprint, provider, model,
  generated_at, dispatched_at, dispatch_error
`;

export async function getLatestAiRecommendation() {
  const row = await getOne<AiRecommendationRow>(
    `SELECT ${AI_SELECT_FIELDS}
     FROM ai_recommendations
     ORDER BY generated_at DESC
     LIMIT 1`
  );
  return row ? rowToRecommendation(row) : null;
}

function aiEnabled() {
  return env.AI_AGENT_ENABLED === 'true' || env.AI_AGENT_ENABLED === '1';
}

export function shouldRunAiAgentAutomatically() {
  return aiEnabled();
}

function autoDispatchEnabled() {
  return env.AI_AGENT_AUTO_DISPATCH === 'true' || env.AI_AGENT_AUTO_DISPATCH === '1';
}

function aiProvider(): 'ollama' | 'nvidia' {
  return env.AI_AGENT_PROVIDER === 'nvidia' ? 'nvidia' : 'ollama';
}

function activeModel() {
  return aiProvider() === 'nvidia' ? nvidiaModel() : ollamaModel();
}

function providerConfigured() {
  return aiProvider() === 'nvidia' ? isNvidiaConfigured() : isOllamaConfigured();
}

function cooldownMs() {
  const minutes = Number(env.AI_AGENT_COOLDOWN_MINUTES ?? 360);
  return (Number.isFinite(minutes) ? Math.max(1, minutes) : 360) * 60 * 1000;
}

function severityRank(severity?: string) {
  if (severity === 'critical') return 4;
  if (severity === 'warning') return 3;
  if (severity === 'watch') return 2;
  return 1;
}

function normalizeSeverity(value: unknown): AiRecommendationSeverity {
  return value === 'critical' || value === 'warning' || value === 'watch' || value === 'info'
    ? value
    : 'info';
}

function physiologicalAbnormalities(device: DeviceTelemetry) {
  const items: string[] = [];
  if (device.hr != null && (device.hr > 150 || device.hr < 50)) items.push(`HR ${device.hr} bpm`);
  if (device.spo2 != null && device.spo2 < 90) items.push(`SpO2 ${device.spo2}%`);
  if (device.bt != null && (device.bt > 41 || device.bt < 32)) items.push(`BT ${device.bt}簞C`);
  if (device.bpHi != null && (device.bpHi > 200 || device.bpHi < 90)) items.push(`SBP ${device.bpHi} mmHg`);
  return items;
}

function areasFromRegion(region?: string) {
  return Array.from(
    new Set(
      (region ?? '')
        .split(/[??嚗s]+/u)
        .map((area) => area.trim())
        .filter(Boolean)
    )
  );
}

function buildHazardEvidence(hazards: AlertItem[]) {
  return hazards
    .filter((item) => item.status !== 'ended')
    .slice(0, 10)
    .map((item): AgentEvidence => ({
      id: `hazard:${item.id}`,
      source: 'hazard',
      label: `${item.title} ${item.severity}`,
      detail: [item.summary, item.region].filter(Boolean).join(' / ').slice(0, 260),
      severity: item.severity
    }));
}

function buildForecastEvidence(locations: MountainForecastLocation[]) {
  return locations
    .filter((location) => location.riskFlags.length > 0)
    .sort((a, b) => b.riskFlags.length - a.riskFlags.length)
    .slice(0, 30)
    .map((location): AgentEvidence => {
      const firstPeriod = location.periods[0];
      const pop = location.periods
        .map((period) => period.precipitationProbability ?? 0)
        .reduce((max, value) => Math.max(max, value), 0);
      return {
        id: `forecast:${location.county}${location.town}`,
        source: 'forecast',
        label: `${location.county}${location.town}`,
        area: `${location.county}${location.town}`,
        detail: [
          location.riskFlags.join('、'),
          pop ? `最高降雨機率 ${pop}%` : '',
          firstPeriod?.weather ?? '',
          firstPeriod?.description ?? ''
        ]
          .filter(Boolean)
          .join(' / ')
          .slice(0, 260),
        severity: pop >= 70 || location.riskFlags.some((flag) => flag.includes('豪雨') || flag.includes('大雨'))
          ? 'warning'
          : 'watch'
      };
    });
}
function staleMinutes(device: DeviceTelemetry) {
  return Math.max(0, Math.round((Date.now() - device.updatedAt) / 60_000));
}

function scoreDeviceRisk(device: DeviceTelemetry) {
  const reasons: string[] = [];
  let score = 0;
  const physiology = physiologicalAbnormalities(device);
  const stale = staleMinutes(device);

  if (device.sos) {
    score += 100;
    reasons.push('SOS');
  }
  if (physiology.length > 0) {
    score += 35 + physiology.length * 8;
    reasons.push(`生理異常：${physiology.join('、')}`);
  }
  if (!device.online) {
    score += 30;
    reasons.push('離線');
  }
  if (device.battery <= 20) {
    score += 18;
    reasons.push(`低電量 ${device.battery}%`);
  }
  if (device.rssi != null && device.rssi < -110) {
    score += 10;
    reasons.push(`RSSI ${device.rssi}`);
  }
  if (device.snr != null && device.snr < 0) {
    score += 8;
    reasons.push(`SNR ${device.snr}`);
  }
  if (stale >= 10) {
    score += Math.min(20, Math.floor(stale / 5) * 4);
    reasons.push(`${stale} 分鐘未回報`);
  }

  return { score, reasons, physiology, stale };
}

function buildDeviceEvidence(contexts: TeamRiskContext[]) {
  return contexts.slice(0, 10).map((team): AgentEvidence => ({
    id: `device:${team.deviceId}`,
    source: 'device',
    label: team.name,
    detail: [
      team.riskReasons.join('、'),
      team.lat != null && team.lon != null ? `${team.lat.toFixed(5)}, ${team.lon.toFixed(5)}` : '無定位',
      team.physiologicalAbnormalities.length > 0 ? team.physiologicalAbnormalities.join('、') : ''
    ]
      .filter(Boolean)
      .join(' / ')
      .slice(0, 260),
    severity: team.score >= 100 ? 'critical' : team.score >= 35 ? 'warning' : 'watch'
  }));
}

function buildTerrainEvidence(team?: TeamRiskContext) {
  if (!team) return [];
  return [
    {
      id: `terrain:${team.deviceId}`,
      source: 'terrain',
      label: `${team.name} 地形摘要`,
      detail: team.terrain.summary.slice(0, 260),
      severity: team.terrain.status === 'queried' ? 'watch' : 'info'
    } satisfies AgentEvidence
  ];
}
async function buildTeamRiskContext(devices: DeviceTelemetry[]) {
  const baseContexts = devices
    .map((device) => {
      const risk = scoreDeviceRisk(device);
      return { device, risk };
    })
    .filter(({ risk }) => risk.score > 0)
    .sort((a, b) => b.risk.score - a.risk.score)
    .slice(0, 8);

  const focusDevice = baseContexts[0]?.device;
  const focusTerrain = focusDevice ? await buildTerrainSummary(focusDevice) : undefined;

  return baseContexts.map(({ device, risk }, index): TeamRiskContext => {
    const terrain: TerrainSummary =
      index === 0 && focusTerrain
        ? focusTerrain
        : {
            status: device.lat == null || device.lon == null ? 'no_location' : 'not_moved',
            summary: index === 0 ? '尚未取得地形摘要' : '只針對第一順位隊伍查詢地形摘要',
            movementWindowMinutes: 30,
            sampledAt: new Date().toISOString()
          };    return {
      deviceId: device.deviceId,
      name: device.displayName || device.deviceId,
      unit: device.unit,
      score: risk.score,
      riskReasons: risk.reasons,
      online: device.online,
      sos: device.sos,
      battery: device.battery,
      charging: device.charging,
      lat: device.lat,
      lon: device.lon,
      alt: device.alt,
      updatedAt: device.updatedAt,
      staleMinutes: risk.stale,
      rssi: device.rssi,
      snr: device.snr,
      physiologicalAbnormalities: risk.physiology,
      terrain
    };
  });
}

async function buildSnapshot(reason: string): Promise<AgentSnapshot> {
  const labels = await listDeviceLabels();
  const units = await listDeviceUnits();
  const devices = (await listDeviceStates()).map((device) => ({
    ...device,
    displayName: labels.get(device.deviceId) ?? device.displayName,
    unit: units.get(device.deviceId) ?? device.unit
  }));

  const { snapshot: hazardSnapshot } = await getUnifiedHazardSnapshot({ reason });
  let forecastLocations: MountainForecastLocation[] = [];
  let forecastError = '';

  try {
    const forecast = await getMountainForecastSnapshotCached({ horizonHours: 72 });
    forecastLocations = forecast.locations;
  } catch (error) {
    forecastError = error instanceof Error ? error.message : '?⊥????芯? 72 撠?撅勗??';
  }

  const hazards = hazardSnapshot.items.filter((item) => item.status !== 'ended');
  const teamRiskContext = await buildTeamRiskContext(devices);
  const focusTeam = teamRiskContext[0];
  const evidence = [
    ...buildHazardEvidence(hazards),
    ...buildForecastEvidence(forecastLocations),
    ...buildDeviceEvidence(teamRiskContext),
    ...buildTerrainEvidence(focusTeam)
  ];

  return {
    hazards,
    forecastLocations,
    devices,
    teamRiskContext,
    focusTeam,
    evidence,
    forecastError
  };
}

function buildSystemPrompt() {
  return [
    '你是 MountainLink 山域安全指揮中心的受控 AI agent。',
    '你只能根據 CWA 災害警示、72 小時山區天氣預報、裝置位置、生理資訊與地形摘要提出建議。',
    '請先給全局摘要，再鎖定 teamRiskContext[0] 這支最急迫隊伍提出處置建議。',
    '只能輸出符合 schema 的 JSON object，不要輸出 markdown 或額外文字。',
    'operatorRecommendation/recommendedAction 是給指揮中心管理者看的處置建議。',
    'message 與 meshtasticDraft 是直接發給 focusDeviceId 隊伍的 Meshtastic 短訊，必須用第二人稱或直接稱呼隊伍，不可寫成「派遣救援隊伍」這種給管理者看的命令。',
    'Meshtastic 短訊必須包含：隊伍名稱、當地天氣或災害警示、地形或生理注意事項、請隊伍回報狀態與需求；不超過 180 個中文字。',
    '不得宣稱未被資料證實的災害已發生；只能使用「風險升高」「高機率」「建議避開」等措辭。'
  ].join('\n');
}
function buildPrompt(snapshot: AgentSnapshot) {
  const hazardContext = snapshot.hazards.slice(0, 8).map((item) => ({
    id: `hazard:${item.id}`,
    title: item.title,
    severity: item.severity,
    summary: item.summary,
    region: item.region,
    eventAt: item.eventAt,
    issuedAt: item.issuedAt,
    areas: areasFromRegion(item.region)
  }));
  const forecastContext = snapshot.forecastLocations
    .filter((location) => location.riskFlags.length > 0)
    .slice(0, 30)
    .map((location) => ({
      id: `forecast:${location.county}${location.town}`,
      area: `${location.county}${location.town}`,
      riskFlags: location.riskFlags,
      periods: location.periods.slice(0, 4).map((period) => ({
        startTime: period.startTime,
        endTime: period.endTime,
        weather: period.weather,
        pop: period.precipitationProbability,
        temp: period.temperature,
        windSpeed: period.windSpeed,
        description: period.description
      }))
    }));

  return JSON.stringify(
    {
      task: '產生全局摘要，並針對 teamRiskContext[0] 這支最急迫隊伍給出操作建議。',
      outputRules: {
        sendOnlyWhenEvidenceSupportsWarningOrCritical: true,
        maxMessageCharacters: 180,
        targetAreasMustBeMountainAreas: true,
        focusTeamMustComeFromTeamRiskContext: true,
        meshtasticDraftAudience: 'send_to_focus_team_directly',
        meshtasticDraftMustNotBeOperatorInstruction: true,
        meshtasticDraftExample: '合歡山SOS示範隊，目前所在地有豪雨特報，周邊地形陡峭請注意坍塌風險，請盡可能移動至地勢平緩處並回報狀態及需求。'
      },
      evidenceCatalog: snapshot.evidence,
      hazards: hazardContext,
      mountainForecast72h: forecastContext,
      teamRiskContext: snapshot.teamRiskContext.map((team) => ({
        deviceId: team.deviceId,
        name: team.name,
        unit: team.unit,
        score: team.score,
        riskReasons: team.riskReasons,
        location: team.lat != null && team.lon != null ? { lat: team.lat, lon: team.lon, alt: team.alt } : null,
        updatedAt: team.updatedAt ? new Date(team.updatedAt).toISOString() : null,
        staleMinutes: team.staleMinutes,
        battery: team.battery,
        online: team.online,
        sos: team.sos,
        rssi: team.rssi,
        snr: team.snr,
        physiologicalAbnormalities: team.physiologicalAbnormalities,
        terrain: team.terrain
      })),
      focusDeviceId: snapshot.focusTeam?.deviceId ?? null,
      forecastError: snapshot.forecastError ?? null
    },
    null,
    2
  );
}

function isLlmRecommendation(value: unknown): value is LlmRecommendation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.severity === 'string' &&
    typeof candidate.globalSummary === 'string' &&
    typeof candidate.focusDeviceId === 'string' &&
    typeof candidate.teamSituationSummary === 'string' &&
    typeof candidate.terrainSummary === 'string' &&
    typeof candidate.physiologySummary === 'string' &&
    typeof candidate.operatorRecommendation === 'string' &&
    typeof candidate.meshtasticDraft === 'string' &&
    Array.isArray(candidate.evidenceIds) &&
    typeof candidate.send === 'boolean'
  );
}

function selectedEvidence(output: LlmRecommendation, evidence: AgentEvidence[]) {
  const catalog = new Map(evidence.map((item) => [item.id, item]));
  return (output.evidenceIds ?? [])
    .map((id) => catalog.get(id))
    .filter((item): item is AgentEvidence => Boolean(item));
}

function messageLength(message: string) {
  return Array.from(message.trim()).length;
}

function fingerprintOf(output: LlmRecommendation, evidence: AiRecommendationEvidence[]) {
  const base = {
    severity: normalizeSeverity(output.severity),
    focusDeviceId: output.focusDeviceId ?? '',
    targetAreas: [...(output.targetAreas ?? [])].sort(),
    evidenceIds: evidence.map((item) => item.id).sort()
  };
  return createHash('sha1').update(JSON.stringify(base)).digest('hex');
}

async function hasRecentDispatch(fingerprint: string) {
  const since = new Date(Date.now() - cooldownMs()).toISOString();
  const row = await getOne<{ id: string }>(
    `SELECT id FROM ai_recommendations
     WHERE fingerprint = ? AND status = 'sent' AND generated_at >= ?
     LIMIT 1`,
    [fingerprint, since]
  );
  return Boolean(row);
}

async function validateRecommendation(
  output: LlmRecommendation,
  snapshot: AgentSnapshot,
  evidence: AiRecommendationEvidence[],
  fingerprint: string
) {
  const errors: string[] = [];
  const severity = normalizeSeverity(output.severity);

  if (!snapshot.focusTeam) errors.push('目前沒有可鎖定的有狀況隊伍');
  if (snapshot.focusTeam && output.focusDeviceId !== snapshot.focusTeam.deviceId) {
    errors.push('focusDeviceId 必須是本次排序第一的有狀況隊伍');
  }

  if (output.send && severityRank(severity) < severityRank('warning')) {
    errors.push('send=true 時 severity 必須是 warning 或 critical');
  }

  if (output.send && !evidence.some((item) => item.source === 'hazard' || item.source === 'forecast')) {
    errors.push('自動發送至少需要 CWA 災害警示或 72 小時山區 forecast evidence');
  }

  const targetAreas = (output.targetAreas ?? []).map((area) => area.trim()).filter(Boolean);
  if (output.send && targetAreas.length === 0) {
    errors.push('自動發送必須指定 targetAreas');
  }
  for (const area of targetAreas) {
    if (!isMountainArea(area)) errors.push(`target area 不在山區白名單：${area}`);
  }

  const draft = meshtasticMessageForTeam(output, snapshot, evidence);
  if (messageLength(draft) > 180) {
    errors.push('Meshtastic 草稿不可超過 180 個中文字');
  }

  if (/(已發生|已坍方|已滑坡|災害已發生|確認崩塌)/u.test(draft)) {
    errors.push('訊息不可宣稱未被資料證實的災害已發生');
  }

  if (output.send && (await hasRecentDispatch(fingerprint))) {
    errors.push('相同 fingerprint 仍在冷卻時間內，不重複發送');
  }

  return errors;
}
function teamContextFromOutput(output: LlmRecommendation, focusTeam?: TeamRiskContext): AiFocusedTeamContext | undefined {
  if (!focusTeam) return undefined;
  const physiologyFallback = focusTeam.physiologicalAbnormalities.length > 0
    ? focusTeam.physiologicalAbnormalities.join('、')
    : '目前沒有裝置回報的生理異常';
  return {
    deviceId: focusTeam.deviceId,
    name: focusTeam.name,
    unit: focusTeam.unit,
    situationSummary: (output.teamSituationSummary || focusTeam.riskReasons.join('、')).trim().slice(0, 220),
    physiologySummary: (output.physiologySummary || physiologyFallback).trim().slice(0, 220),
    terrainSummary: (output.terrainSummary || focusTeam.terrain.summary).trim().slice(0, 260),
    operatorRecommendation: (output.operatorRecommendation || output.recommendedAction || '持續監控隊伍狀態並確認通訊。').trim().slice(0, 260),
    movementMeters: focusTeam.terrain.movementMeters,
    movementWindowMinutes: focusTeam.terrain.movementWindowMinutes
  };
}

function alertLabelFromEvidence(evidence: AiRecommendationEvidence[]) {
  const hazard = evidence.find((item) => item.source === 'hazard');
  if (!hazard) return '山區天氣風險升高';
  const title = hazard.label
    .replace(/\s+(critical|warning|watch|info)$/i, '')
    .replace(/[：:]\s*$/, '')
    .trim();
  return title || '山區天氣風險升高';
}

function terrainWarningText(summary?: string) {
  if (!summary) return '請注意地形風險';
  if (/高差大|陡坡|崩塌|坍塌|地形陡峭|行動需保守/.test(summary)) {
    return '周邊地形陡峭，請注意坍塌與落石風險';
  }
  if (/明顯起伏|確認路線|高差/.test(summary)) {
    return '周邊地形起伏明顯，請確認路線安全';
  }
  return '請留意周邊地形與天候變化';
}

function looksLikeOperatorInstruction(message: string) {
  return /(派遣|救援隊伍|前往|指揮中心|管理者|應立即派|通知附近隊伍|請附近隊伍|救援人員)/.test(message);
}

function trimMessage(message: string, max = 180) {
  const chars = Array.from(message.trim());
  return chars.length <= max ? message.trim() : `${chars.slice(0, max - 1).join('')}…`;
}

function meshtasticMessageForTeam(output: LlmRecommendation, snapshot: AgentSnapshot, evidence: AiRecommendationEvidence[]) {
  const raw = (output.meshtasticDraft || output.message || '').trim();
  if (raw && !looksLikeOperatorInstruction(raw) && messageLength(raw) <= 180) return raw;

  const team = snapshot.focusTeam;
  if (!team) return trimMessage(raw || '目前山區風險升高，請回報狀態與需求。');

  const hazardText = alertLabelFromEvidence(evidence);
  const terrainText = terrainWarningText(team.terrain.summary);
  const teamName = team.name || team.deviceId;
  return trimMessage(`${teamName}，目前所在地有${hazardText}，${terrainText}，請盡可能移動至地勢平緩安全處並回報狀態及需求。`);
}

function recommendationFromOutput(
  output: LlmRecommendation,
  snapshot: AgentSnapshot,
  evidence: AiRecommendationEvidence[],
  validationErrors: string[],
  rawJson: unknown,
  provider: 'ollama' | 'nvidia',
  model: string
): AiRecommendation & { rawJson: unknown } {
  const fingerprint = fingerprintOf(output, evidence);
  const severity = normalizeSeverity(output.severity);
  const status: AiRecommendationStatus = validationErrors.length > 0 ? 'blocked' : 'watch';
  const message = meshtasticMessageForTeam(output, snapshot, evidence);

  return {
    id: randomUUID(),
    status,
    severity,
    title: (output.title || 'AI 情境建議').trim().slice(0, 80),
    reasoningSummary: (output.reasoningSummary || output.globalSummary || 'AI 已完成情境分析。').trim().slice(0, 400),
    recommendedAction: (output.operatorRecommendation || output.recommendedAction || '持續監控隊伍狀態並確認通訊。').trim().slice(0, 300),
    message,
    targetAreas: (output.targetAreas ?? []).map((area) => area.trim()).filter(Boolean).slice(0, 20),
    globalSummary: (output.globalSummary || output.reasoningSummary || '').trim().slice(0, 260),
    focusDeviceId: snapshot.focusTeam?.deviceId,
    teamContext: teamContextFromOutput(output, snapshot.focusTeam),
    evidence,
    validationErrors,
    fingerprint,
    provider,
    model,
    generatedAt: new Date().toISOString(),
    rawJson
  };
}
function syntheticRecommendation(status: AiRecommendationStatus, title: string, message: string, error?: string) {
  const provider = aiProvider();
  return {
    id: randomUUID(),
    status,
    severity: 'info' as AiRecommendationSeverity,
    title,
    reasoningSummary: message,
    recommendedAction: '維持既有災害與裝置監控。',
    message: '',
    targetAreas: [],
    globalSummary: message,
    evidence: [],
    validationErrors: error ? [error] : [],
    fingerprint: createHash('sha1').update(`${status}|${title}|${message}|${error ?? ''}`).digest('hex'),
    provider,
    model: activeModel(),
    generatedAt: new Date().toISOString(),
    rawJson: { status, error: error ?? '' }
  };
}
async function storeRecommendation(recommendation: AiRecommendation & { rawJson?: unknown }) {
  await run(
    `INSERT INTO ai_recommendations (
       id, status, severity, title, reasoning_summary, recommended_action, message,
       target_areas_json, global_summary, focus_device_id, team_context_json,
       evidence_json, raw_json, validation_errors_json,
       fingerprint, provider, model, generated_at, dispatched_at, dispatch_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recommendation.id,
      recommendation.status,
      recommendation.severity,
      recommendation.title,
      recommendation.reasoningSummary,
      recommendation.recommendedAction,
      recommendation.message,
      JSON.stringify(recommendation.targetAreas),
      recommendation.globalSummary ?? null,
      recommendation.focusDeviceId ?? null,
      JSON.stringify(recommendation.teamContext ?? null),
      JSON.stringify(recommendation.evidence),
      JSON.stringify(recommendation.rawJson ?? {}),
      JSON.stringify(recommendation.validationErrors),
      recommendation.fingerprint,
      recommendation.provider,
      recommendation.model,
      recommendation.generatedAt,
      recommendation.dispatchedAt ?? null,
      recommendation.dispatchError ?? null
    ]
  );
}

async function updateDispatchState(id: string, status: AiRecommendationStatus, dispatchedAt?: string, dispatchError?: string) {
  await run(
    `UPDATE ai_recommendations
     SET status = ?, dispatched_at = ?, dispatch_error = ?
     WHERE id = ?`,
    [status, dispatchedAt ?? null, dispatchError ?? null, id]
  );
}

async function analyze(reason: string) {
  if (!aiEnabled()) {
    const disabled = syntheticRecommendation('disabled', 'AI 暫停', '請設定 AI_AGENT_ENABLED=true 以啟用 AI agent。');
    await storeRecommendation(disabled);
    return disabled;
  }

  if (!providerConfigured()) {
    const disabled = syntheticRecommendation(
      'disabled',
      'AI 暫停',
      aiProvider() === 'nvidia' ? '請設定 NVIDIA_API_KEY 以啟用 NVIDIA API。' : '請設定 OLLAMA_BASE_URL 以啟用 Ollama。'
    );
    await storeRecommendation(disabled);
    return disabled;
  }

  const snapshot = await buildSnapshot(reason);
  if (!snapshot.focusTeam) {
    const noTeam = syntheticRecommendation('watch', '目前沒有有狀況隊伍', '目前未偵測到 SOS、生理異常、離線、低電量或通訊品質差的隊伍。');
    await storeRecommendation(noTeam);
    return noTeam;
  }

  let llmResult: Awaited<ReturnType<typeof generateOllamaJson>> | Awaited<ReturnType<typeof generateNvidiaJson>>;
  const provider = aiProvider();
  try {
    const request = {
      system: buildSystemPrompt(),
      prompt: buildPrompt(snapshot),
      schema: AI_RECOMMENDATION_SCHEMA
    };
    llmResult = provider === 'nvidia' ? await generateNvidiaJson(request) : await generateOllamaJson(request);
  } catch (error) {
    const failed = syntheticRecommendation(
      'failed',
      'AI 分析失敗',
      provider === 'nvidia' ? 'NVIDIA API 回應失敗，無法產生分析。' : 'Ollama 回應失敗，無法產生分析。',
      error instanceof Error ? error.message : `unknown ${provider} error`
    );
    await storeRecommendation(failed);
    return failed;
  }

  if (!isLlmRecommendation(llmResult.json)) {
    const failed = syntheticRecommendation('failed', 'AI 分析失敗', `${provider} 回傳不符合 schema。`, 'invalid response schema');
    await storeRecommendation(failed);
    return failed;
  }

  const output = llmResult.json;
  const evidence = selectedEvidence(output, snapshot.evidence);
  const fingerprint = fingerprintOf(output, evidence);
  const validationErrors = await validateRecommendation(output, snapshot, evidence, fingerprint);
  let recommendation = recommendationFromOutput(output, snapshot, evidence, validationErrors, llmResult.raw, provider, llmResult.model);
  recommendation.fingerprint = fingerprint;

  await storeRecommendation(recommendation);

  if (recommendation.status !== 'blocked' && recommendation.status !== 'failed') {
    const dispatch = await dispatchAiRecommendation(recommendation);
    if (dispatch.sent) {
      recommendation = {
        ...recommendation,
        status: 'sent',
        dispatchedAt: dispatch.dispatchedAt ?? new Date().toISOString()
      };
      await updateDispatchState(recommendation.id, recommendation.status, recommendation.dispatchedAt);
    } else if (!dispatch.skipped) {
      recommendation = {
        ...recommendation,
        status: 'failed',
        dispatchError: dispatch.error ?? 'dispatch failed'
      };
      await updateDispatchState(recommendation.id, recommendation.status, undefined, recommendation.dispatchError);
    }
  }

  return recommendation;
}
export async function runAiRecommendationAnalysis(options?: { reason?: string; broadcast?: boolean }) {
  if (runInFlight) return runInFlight;

  runInFlight = analyze(options?.reason ?? 'manual_ai_run')
    .then((recommendation) => {
      if (options?.broadcast !== false) {
        broadcastSse('ai_recommendation_update', recommendation);
      }
      return recommendation;
    })
    .finally(() => {
      runInFlight = null;
    });

  return runInFlight;
}
