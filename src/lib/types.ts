// src/lib/types.ts
export type DeviceTelemetry = {
  deviceId: string;
  online: boolean;
  battery: number; // 0~100
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
