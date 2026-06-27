// src/lib/types.ts
export type DeviceTelemetry = {
  deviceId: string;
  displayName?: string;
  online: boolean;
  battery: number; // 0~100
  charging?: boolean;
  hr?: number;
  lat?: number;
  lon?: number;
  alt?: number;
  updatedAt: number; // epoch ms
  sos?: boolean;
  rssi?: number;
  snr?: number;
  sats?: number;
  speed?: number;
  spo2?: number;
  bpHi?: number;
  bpLo?: number;
  bt?: number;
  packetId?: number;
  sender?: string;
  channel?: number;
  hopsAway?: number;
  hopStart?: number;
  unit?: string;
};

export type TelemetryEvent = {
  type: 'telemetry';
  devices: DeviceTelemetry[];
};

export type OnlineEvent = {
  type: 'online';
  deviceId: string;
  online: boolean;
  updatedAt: number;
};

export type MLinkSseEvent = TelemetryEvent | OnlineEvent;

export type AiRecommendationSeverity = 'info' | 'watch' | 'warning' | 'critical';
export type AiRecommendationStatus = 'sent' | 'watch' | 'blocked' | 'failed' | 'disabled';

export type AiRecommendationEvidence = {
  id: string;
  source: 'hazard' | 'forecast' | 'device' | 'terrain';
  label: string;
  detail?: string;
};

export type AiFocusedTeamContext = {
  deviceId: string;
  name: string;
  unit?: string;
  situationSummary: string;
  physiologySummary: string;
  terrainSummary: string;
  operatorRecommendation: string;
  movementMeters?: number;
  movementWindowMinutes?: number;
};

export type AiRecommendation = {
  id: string;
  status: AiRecommendationStatus;
  severity: AiRecommendationSeverity;
  title: string;
  reasoningSummary: string;
  recommendedAction: string;
  message: string;
  targetAreas: string[];
  globalSummary?: string;
  focusDeviceId?: string;
  teamContext?: AiFocusedTeamContext;
  evidence: AiRecommendationEvidence[];
  validationErrors: string[];
  fingerprint: string;
  provider: 'ollama' | 'nvidia';
  model: string;
  generatedAt: string;
  dispatchedAt?: string;
  dispatchError?: string;
};

export type RainLevel = '超大豪雨' | '大豪雨' | '豪雨' | '大雨';
export type RainStatus = 'active' | 'ended';

export type RainAlert = {
  id: string;
  kind: 'RAIN';
  status: RainStatus;
  level: RainLevel;
  headline: string;
  title: string;
  description: string;
  web?: string;
  issuedAt: number;
  onsetAt?: number;
  expiresAt?: number;
  areas: string[];
  raw?: unknown;
};

export type ColdStatus = 'active' | 'ended';
export type ColdLevel = '低溫紅色燈號' | '低溫橙色燈號' | '低溫黃色燈號' | '低溫特報';

export type ColdAlert = {
  id: string;
  kind: 'COLD';
  status: ColdStatus;
  level: ColdLevel;
  headline: string;
  title: string;
  description: string;
  web?: string;
  issuedAt: number;
  onsetAt?: number;
  expiresAt?: number;
  areas: string[];
  counties: string[];
  raw?: unknown;
};

export type EqReport = {
  id: string;
  source: 'CWA_REPORT';
  earthquakeNo: number;
  originTime: number;
  issuedAt?: number;
  magnitude?: number;
  depthKm?: number;
  epicenter: {
    lat: number;
    lon: number;
    locationText: string;
  };
  intensityByCounty: Record<string, number>;
  maxIntensity?: number;
  reportContent?: string;
  web?: string;
  images?: {
    report?: string;
    shakemap?: string;
  };
  raw?: unknown;
};

export type EqTrigger = {
  id: string;
  source: 'EQ_WAKEUP' | 'OTHER_APP';
  triggeredAt: number;
  site: { county: string; town?: string };
  thresholdIntensity: number;
  estimatedIntensity?: number;
  receivedAt: number;
  raw?: unknown;
};

export type EarthquakeEvent = {
  id: string;
  kind: 'EARTHQUAKE';
  hasReport: boolean;
  hasTrigger: boolean;
  reportId?: string;
  triggerIds: string[];
  firstSeenAt: number;
  originTime?: number;
  reportedAt?: number;
  magnitude?: number;
  depthKm?: number;
  epicenterLat?: number;
  epicenterLon?: number;
  epicenterText?: string;
  maxIntensity?: number;
  intensityByCounty?: Record<string, number>;
  title: string;
  summary: string;
  severityScore: number;
  raw?: unknown;
};

export type MountainForecastPeriod = {
  startTime?: string;
  endTime?: string;
  dataTime?: string;
  weather?: string;
  weatherCode?: string;
  precipitationProbability?: number;
  temperature?: number;
  apparentTemperature?: number;
  relativeHumidity?: number;
  windSpeed?: string;
  windDirection?: string;
  comfort?: string;
  description?: string;
};

export type MountainForecastLocation = {
  county: string;
  town: string;
  datasetId: string;
  periods: MountainForecastPeriod[];
  riskFlags: string[];
};

export type MountainForecastSnapshot = {
  issuedAt: string;
  source: 'CWA';
  horizonHours: number;
  locations: MountainForecastLocation[];
};
